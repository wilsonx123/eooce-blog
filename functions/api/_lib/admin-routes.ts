/** 管理路由（與 Express 版 src/routes/admin.ts 一致；多語句寫操作用 D1 batch 保證原子性） */
import bcrypt from 'bcryptjs'
import dayjs from 'dayjs'
import { z } from 'zod'
import { route, type HandlerResult, type RouteCtx } from './router'
import { HttpError } from './http'
import { qAll, qFirst, qRun, qBatch } from './db'
import { estimateReadingMinutes, now, likePattern } from './search'
import { autoSlug, slugify, randomSuffix, assertValidSlug } from './slug'
import { hashPassword, verifyPassword } from './password'
import { signToken, jwtSecret } from './jwt'

const SHARED_SYSTEM_PATHS = ['/', '/archives', '/about', '/categories', '/tags', '/guestbook']
const ALLOWED_SYSTEM_PATHS = SHARED_SYSTEM_PATHS

export function registerAdminRoutes(): void {
/* ---------------- stats ---------------- */

route('GET', 'admin/stats', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const posts = await qFirst<{ total: number; published: number | null; drafts: number | null; views: number | null }>(
    db,
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts,
       SUM(views) AS views FROM posts`,
  )
  const comments = await qFirst<{ total: number; pending: number | null }>(
    db,
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM comments`,
  )

  const days: string[] = []
  for (let i = 6; i >= 0; i--) days.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'))

  // 兩條趨勢查詢各用一次 GROUP BY 聚合，服務端補零（與 Express 版逐日查詢等價）
  const postTrendRows = await qAll<{ d: string; c: number }>(
    db,
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS c FROM posts
     WHERE substr(created_at, 1, 10) IN (${days.map(() => '?').join(',')}) GROUP BY d`,
    ...days,
  )
  const commentTrendRows = await qAll<{ d: string; c: number }>(
    db,
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS c FROM comments
     WHERE substr(created_at, 1, 10) IN (${days.map(() => '?').join(',')}) GROUP BY d`,
    ...days,
  )
  const toCount = (rows: Array<{ d: string; c: number }>) => {
    const map = new Map(rows.map((r) => [r.d, r.c]))
    return days.map((d) => ({ date: d, count: map.get(d) ?? 0 }))
  }

  return {
    data: {
      posts: { total: posts?.total ?? 0, published: posts?.published ?? 0, drafts: posts?.drafts ?? 0 },
      comments: { total: comments?.total ?? 0, pending: comments?.pending ?? 0 },
      views: posts?.views ?? 0,
      trend: { posts: toCount(postTrendRows), comments: toCount(commentTrendRows) },
    },
  }
})

/* ---------------- posts ---------------- */

const postPayload = z.object({
  title: z.string().trim().min(1, '標題不能為空').max(120),
  slug: z.string().trim().max(140).optional(),
  summary: z.string().trim().max(500).optional(),
  content: z.string().min(1, '正文不能為空'),
  cover_image: z.string().trim().max(500).optional(),
  category_id: z.number().int().nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  pinned: z.boolean().default(false),
  tag_ids: z.array(z.number().int()).default([]),
})

async function uniquePostSlug(
  db: D1DatabaseLike,
  title: string,
  requested: string | undefined,
  excludeId?: number,
): Promise<string> {
  // 手動填寫的路徑按原樣轉寫；留空則按標題自動生成短路徑
  const base = requested ? slugify(requested) : autoSlug(title)
  assertValidSlug(base)
  let candidate = base
  let attempt = 0
  while (true) {
    const row = excludeId
      ? await qFirst(db, 'SELECT id FROM posts WHERE slug = ? AND id != ?', candidate, excludeId)
      : await qFirst(db, 'SELECT id FROM posts WHERE slug = ?', candidate)
    if (!row) return candidate
    attempt += 1
    candidate = `${base}-${randomSuffix(4 + attempt)}`
  }
}

async function uniqueName(
  db: D1DatabaseLike,
  table: 'categories' | 'tags',
  name: string,
  excludeId?: number,
): Promise<void> {
  const row = excludeId
    ? await qFirst(db, `SELECT id FROM ${table} WHERE name = ? AND id != ?`, name, excludeId)
    : await qFirst(db, `SELECT id FROM ${table} WHERE name = ?`, name)
  if (row) throw new HttpError(409, '名稱已存在')
}

async function replacePostTags(db: D1DatabaseLike, postId: number, tagIds: number[]): Promise<void> {
  const items = [{ sql: 'DELETE FROM post_tags WHERE post_id = ?', params: [postId] }]
  for (const tagId of tagIds) {
    items.push({ sql: 'INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', params: [postId, tagId] })
  }
  // batch 原子執行，整體刪除後重建關聯
  await qBatch(db, items)
}

route('GET', 'admin/posts', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const url = ctx.url
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const statusParam = url.searchParams.get('status') ?? ''
  const status = ['draft', 'published'].includes(statusParam) ? statusParam : ''
  const search = (url.searchParams.get('q') ?? '').trim()

  const where: string[] = []
  const params: unknown[] = []
  if (status) {
    where.push('p.status = ?')
    params.push(status)
  }
  if (search) {
    where.push(`p.title LIKE ? ESCAPE '\\'`)
    params.push(likePattern(search))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = await qFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM posts p ${whereSql}`, ...params)
  const rows = await qAll(
    db,
    `SELECT p.id, p.title, p.slug, p.summary, p.status, p.pinned, p.views, p.reading_minutes,
       p.published_at, p.created_at, p.updated_at,
       c.name AS category_name, c.id AS category_id,
       (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count
     FROM posts p LEFT JOIN categories c ON c.id = p.category_id
     ${whereSql} ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  )
  return { data: { list: rows, total: totalRow?.c ?? 0, page, pageSize } }
})

route('GET', 'admin/posts/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const post = await qFirst(ctx.env.DB, 'SELECT * FROM posts WHERE id = ?', Number(ctx.params.id))
  if (!post) throw new HttpError(404, '文章不存在')
  const tags = await qAll<{ id: number }>(
    ctx.env.DB,
    'SELECT t.id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ?',
    post.id,
  )
  return { data: { ...post, tag_ids: tags.map((t) => t.id) } }
})

route('POST', 'admin/posts', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const parsed = postPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '文章資料不完整')
  }
  const p = parsed.data
  const slug = await uniquePostSlug(db, p.title, p.slug)
  const result = await qRun(
    db,
    `INSERT INTO posts (title, slug, summary, content, cover_image, category_id, status, pinned, reading_minutes, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.title,
    slug,
    p.summary ?? '',
    p.content,
    p.cover_image ?? '',
    p.category_id ?? null,
    p.status,
    p.pinned ? 1 : 0,
    estimateReadingMinutes(p.content),
    p.status === 'published' ? now() : null,
  )
  await replacePostTags(db, result.lastRowId, p.tag_ids)
  return { data: { id: result.lastRowId, slug }, code: 201 }
})

route('PUT', 'admin/posts/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const existing = await qFirst<{ id: number; status: string; published_at: string | null }>(
    db,
    'SELECT * FROM posts WHERE id = ?',
    id,
  )
  if (!existing) throw new HttpError(404, '文章不存在')

  const parsed = postPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '文章資料不完整')
  }
  const p = parsed.data
  const slug = await uniquePostSlug(db, p.title, p.slug, id)
  const publishedAt = existing.published_at ?? (p.status === 'published' ? now() : null)

  await qRun(
    db,
    `UPDATE posts SET title = ?, slug = ?, summary = ?, content = ?, cover_image = ?, category_id = ?,
       status = ?, pinned = ?, reading_minutes = ?, published_at = ?, updated_at = ? WHERE id = ?`,
    p.title,
    slug,
    p.summary ?? '',
    p.content,
    p.cover_image ?? '',
    p.category_id ?? null,
    p.status,
    p.pinned ? 1 : 0,
    estimateReadingMinutes(p.content),
    publishedAt,
    now(),
    id,
  )
  await replacePostTags(db, id, p.tag_ids)
  return { data: { id } }
})

route('PATCH', 'admin/posts/:id/status', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const schema = z.object({
    status: z.enum(['draft', 'published']).optional(),
    pinned: z.boolean().optional(),
  })
  const parsed = schema.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '狀態參數不合法')
  }
  const post = await qFirst<{ id: number; status: string; published_at: string | null }>(
    db,
    'SELECT * FROM posts WHERE id = ?',
    id,
  )
  if (!post) throw new HttpError(404, '文章不存在')

  if (parsed.data.status && parsed.data.status !== post.status) {
    const publishedAt = parsed.data.status === 'published' ? (post.published_at ?? now()) : post.published_at
    await qRun(db, 'UPDATE posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?', parsed.data.status, publishedAt, now(), id)
  }
  if (parsed.data.pinned !== undefined) {
    await qRun(db, 'UPDATE posts SET pinned = ?, updated_at = ? WHERE id = ?', parsed.data.pinned ? 1 : 0, now(), id)
  }
  return { data: { id } }
})

route('DELETE', 'admin/posts/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const result = await qRun(ctx.env.DB, 'DELETE FROM posts WHERE id = ?', Number(ctx.params.id))
  if (result.changes === 0) throw new HttpError(404, '文章不存在')
  return { data: { id: Number(ctx.params.id) } }
})

/* ---------------- categories ---------------- */

const categoryPayload = z.object({
  name: z.string().trim().min(1, '分類名不能為空').max(30),
  slug: z.string().trim().max(60).optional(),
  description: z.string().trim().max(200).optional(),
})

route('GET', 'admin/categories', async (ctx: RouteCtx): Promise<HandlerResult> => {
  // 順序與前台一致（sort_order 優先，未設定時按文章數），後台的上移/下移才對得上
  const list = await qAll(
    ctx.env.DB,
    `SELECT c.*, COUNT(p.id) AS post_count
     FROM categories c
     LEFT JOIN posts p ON p.category_id = c.id AND p.status = 'published'
     GROUP BY c.id ORDER BY c.sort_order, post_count DESC, c.name`,
  )
  return { data: list }
})

/** 上移 / 下移：先按當前展示順序把 sort_order 歸一化為 0..n-1，再與相鄰項交換 */
route('PATCH', 'admin/categories/:id/move', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const parsed = z.object({ direction: z.enum(['up', 'down']) }).safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '方向參數不合法')
  }
  const rows = await qAll<{ id: number }>(
    db,
    `SELECT c.id, COUNT(p.id) AS post_count
     FROM categories c
     LEFT JOIN posts p ON p.category_id = c.id AND p.status = 'published'
     GROUP BY c.id ORDER BY c.sort_order, post_count DESC, c.name`,
  )
  const idx = rows.findIndex((r) => r.id === id)
  if (idx < 0) throw new HttpError(404, '分類不存在')
  const target = parsed.data.direction === 'up' ? idx - 1 : idx + 1

  const items: Array<{ sql: string; params?: unknown[] }> = []
  // 歸一化：把當前展示順序固化為顯式 sort_order，再交換目標相鄰兩項
  rows.forEach((r, i) => items.push({ sql: 'UPDATE categories SET sort_order = ? WHERE id = ?', params: [i, r.id] }))
  if (target >= 0 && target < rows.length) {
    items.push({ sql: 'UPDATE categories SET sort_order = ? WHERE id = ?', params: [target, rows[idx].id] })
    items.push({ sql: 'UPDATE categories SET sort_order = ? WHERE id = ?', params: [idx, rows[target].id] })
  }
  await qBatch(db, items)
  return { data: { id } }
})

route('POST', 'admin/categories', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const parsed = categoryPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '分類資料不完整')
  }
  const { name } = parsed.data
  await uniqueName(db, 'categories', name)
  let slug = slugify(parsed.data.slug || name)
  while (await qFirst(db, 'SELECT id FROM categories WHERE slug = ?', slug)) {
    slug = `${slugify(parsed.data.slug || name)}-${randomSuffix()}`
  }
  // 新分類排在最後，避免後台調整過順序後被插入到最前面
  const maxRow = await qFirst<{ m: number | null }>(db, 'SELECT MAX(sort_order) AS m FROM categories')
  const nextOrder = (maxRow?.m ?? -1) + 1
  const result = await qRun(
    db,
    'INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)',
    name,
    slug,
    parsed.data.description ?? '',
    nextOrder,
  )
  return { data: { id: Number(result.lastRowId) }, code: 201 }
})

route('PUT', 'admin/categories/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const existing = await qFirst<{ id: number; slug: string }>(db, 'SELECT * FROM categories WHERE id = ?', id)
  if (!existing) throw new HttpError(404, '分類不存在')
  const parsed = categoryPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '分類資料不完整')
  }
  await uniqueName(db, 'categories', parsed.data.name, id)

  // 允許自定義 slug；留空保持不變，傳入值做唯一性與保留字檢查
  let slug = existing.slug
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    slug = slugify(parsed.data.slug)
    assertValidSlug(slug)
    let attempt = 0
    while (await qFirst(db, 'SELECT id FROM categories WHERE slug = ? AND id != ?', slug, id)) {
      attempt += 1
      slug = `${slugify(parsed.data.slug)}-${randomSuffix(4 + attempt)}`
    }
  }

  await qRun(db, 'UPDATE categories SET name = ?, slug = ?, description = ? WHERE id = ?', parsed.data.name, slug, parsed.data.description ?? '', id)
  return { data: { id } }
})

route('DELETE', 'admin/categories/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const result = await qRun(ctx.env.DB, 'DELETE FROM categories WHERE id = ?', Number(ctx.params.id))
  if (result.changes === 0) throw new HttpError(404, '分類不存在')
  return { data: { deleted: result.changes } }
})

/* ---------------- tags ---------------- */

const tagPayload = z.object({
  name: z.string().trim().min(1, '標籤名不能為空').max(30),
})

route('GET', 'admin/tags', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const list = await qAll(
    ctx.env.DB,
    `SELECT t.*, COUNT(pt.post_id) AS post_count FROM tags t
     LEFT JOIN post_tags pt ON pt.tag_id = t.id GROUP BY t.id ORDER BY t.name`,
  )
  return { data: list }
})

route('POST', 'admin/tags', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const parsed = tagPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '標籤資料不完整')
  }
  const { name } = parsed.data
  await uniqueName(db, 'tags', name)
  let slug = slugify(name)
  while (await qFirst(db, 'SELECT id FROM tags WHERE slug = ?', slug)) {
    slug = `${slugify(name)}-${randomSuffix()}`
  }
  const result = await qRun(db, 'INSERT INTO tags (name, slug) VALUES (?, ?)', name, slug)
  return { data: { id: Number(result.lastRowId) }, code: 201 }
})

route('PUT', 'admin/tags/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const existing = await qFirst<{ id: number }>(db, 'SELECT * FROM tags WHERE id = ?', id)
  if (!existing) throw new HttpError(404, '標籤不存在')
  const parsed = tagPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '標籤資料不完整')
  }
  await uniqueName(db, 'tags', parsed.data.name, id)
  await qRun(db, 'UPDATE tags SET name = ? WHERE id = ?', parsed.data.name, id)
  return { data: { id } }
})

route('DELETE', 'admin/tags/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const result = await qRun(ctx.env.DB, 'DELETE FROM tags WHERE id = ?', Number(ctx.params.id))
  if (result.changes === 0) throw new HttpError(404, '標籤不存在')
  return { data: { deleted: result.changes } }
})

/** 設為首頁蜂巢 C 位（獨佔：其餘標籤自動取消） */
route('PATCH', 'admin/tags/:id/center', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const tag = await qFirst<{ id: number }>(db, 'SELECT id FROM tags WHERE id = ?', id)
  if (!tag) throw new HttpError(404, '標籤不存在')
  await qRun(db, 'UPDATE tags SET is_center = CASE WHEN id = ? THEN 1 ELSE 0 END', id)
  return { data: { id } }
})

/* ---------------- comments ---------------- */

route('GET', 'admin/comments', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const url = ctx.url
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const statusParam = url.searchParams.get('status') ?? ''
  const status = ['pending', 'approved', 'rejected'].includes(statusParam) ? statusParam : ''
  const where = status ? 'WHERE cm.status = ?' : ''
  const params: unknown[] = status ? [status] : []
  const totalRow = await qFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM comments cm ${where}`, ...params)
  const list = await qAll(
    db,
    `SELECT cm.id, cm.post_id, cm.nickname, cm.email, cm.content, cm.status, cm.created_at,
       p.title AS post_title, p.slug AS post_slug
     FROM comments cm JOIN posts p ON p.id = cm.post_id ${where}
     ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  )
  return { data: { list, total: totalRow?.c ?? 0, page, pageSize } }
})

route('PATCH', 'admin/comments/:id/status', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const parsed = z.object({ status: z.enum(['pending', 'approved', 'rejected']) }).safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '評論狀態不合法')
  }
  const id = Number(ctx.params.id)
  const result = await qRun(ctx.env.DB, 'UPDATE comments SET status = ? WHERE id = ?', parsed.data.status, id)
  if (result.changes === 0) throw new HttpError(404, '評論不存在')
  return { data: { id, status: parsed.data.status } }
})

route('DELETE', 'admin/comments/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const result = await qRun(ctx.env.DB, 'DELETE FROM comments WHERE id = ?', Number(ctx.params.id))
  if (result.changes === 0) throw new HttpError(404, '評論不存在')
  return { data: { deleted: result.changes } }
})

/* ---------------- guestbook ---------------- */

route('GET', 'admin/guestbook', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const url = ctx.url
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const statusParam = url.searchParams.get('status') ?? ''
  const status = ['pending', 'approved', 'rejected'].includes(statusParam) ? statusParam : ''
  const where = status ? 'WHERE status = ?' : ''
  const params: unknown[] = status ? [status] : []
  const totalRow = await qFirst<{ c: number }>(db, `SELECT COUNT(*) AS c FROM guestbook_messages ${where}`, ...params)
  const list = await qAll(
    db,
    `SELECT id, nickname, email, content, status, created_at FROM guestbook_messages ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  )
  return { data: { list, total: totalRow?.c ?? 0, page, pageSize } }
})

route('PATCH', 'admin/guestbook/:id/status', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const parsed = z.object({ status: z.enum(['pending', 'approved', 'rejected']) }).safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '留言狀態不合法')
  }
  const id = Number(ctx.params.id)
  const result = await qRun(ctx.env.DB, 'UPDATE guestbook_messages SET status = ? WHERE id = ?', parsed.data.status, id)
  if (result.changes === 0) throw new HttpError(404, '留言不存在')
  return { data: { id, status: parsed.data.status } }
})

route('DELETE', 'admin/guestbook/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const result = await qRun(ctx.env.DB, 'DELETE FROM guestbook_messages WHERE id = ?', Number(ctx.params.id))
  if (result.changes === 0) throw new HttpError(404, '留言不存在')
  return { data: { deleted: result.changes } }
})

/* ---------------- friend links ---------------- */

const linkPayload = z.object({
  name: z.string().trim().min(1, '名稱不能為空').max(40),
  url: z.string().trim().min(1, '連結不能為空').max(500),
  description: z.string().trim().max(120).default(''),
  visible: z.boolean().default(true),
})

function assertExternalUrl(url: string): void {
  if (!/^https?:\/\/\S+$/.test(url)) throw new HttpError(400, '連結必須是 http(s):// 開頭的完整地址')
}

route('GET', 'admin/links', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const list = await qAll(ctx.env.DB, 'SELECT * FROM friend_links ORDER BY sort_order, id')
  return { data: list }
})

route('POST', 'admin/links', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const parsed = linkPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '連結資料不完整')
  }
  assertExternalUrl(parsed.data.url)
  const maxRow = await qFirst<{ m: number | null }>(db, 'SELECT MAX(sort_order) AS m FROM friend_links')
  const max = maxRow?.m ?? 0
  const result = await qRun(
    db,
    'INSERT INTO friend_links (name, url, description, sort_order, visible) VALUES (?, ?, ?, ?, ?)',
    parsed.data.name,
    parsed.data.url,
    parsed.data.description,
    max + 1,
    parsed.data.visible ? 1 : 0,
  )
  return { data: { id: Number(result.lastRowId) }, code: 201 }
})

route('PUT', 'admin/links/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const existing = await qFirst<{ id: number }>(db, 'SELECT id FROM friend_links WHERE id = ?', id)
  if (!existing) throw new HttpError(404, '連結不存在')
  const parsed = linkPayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '連結資料不完整')
  }
  assertExternalUrl(parsed.data.url)
  await qRun(
    db,
    'UPDATE friend_links SET name = ?, url = ?, description = ?, visible = ? WHERE id = ?',
    parsed.data.name,
    parsed.data.url,
    parsed.data.description,
    parsed.data.visible ? 1 : 0,
    id,
  )
  return { data: { id } }
})

route('PATCH', 'admin/links/:id/move', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const parsed = z.object({ direction: z.enum(['up', 'down']) }).safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '方向參數不合法')
  }
  const row = await qFirst<{ id: number; sort_order: number }>(db, 'SELECT id, sort_order FROM friend_links WHERE id = ?', id)
  if (!row) throw new HttpError(404, '連結不存在')
  const siblings = await qAll<{ id: number; sort_order: number }>(db, 'SELECT id, sort_order FROM friend_links ORDER BY sort_order, id')
  const idx = siblings.findIndex((s) => s.id === id)
  const swapWith = parsed.data.direction === 'up' ? siblings[idx - 1] : siblings[idx + 1]
  if (!swapWith) {
    return { data: { id } }
  }
  await qBatch(db, [
    { sql: 'UPDATE friend_links SET sort_order = ? WHERE id = ?', params: [swapWith.sort_order, row.id] },
    { sql: 'UPDATE friend_links SET sort_order = ? WHERE id = ?', params: [row.sort_order, swapWith.id] },
  ])
  return { data: { id } }
})

route('DELETE', 'admin/links/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const result = await qRun(ctx.env.DB, 'DELETE FROM friend_links WHERE id = ?', Number(ctx.params.id))
  if (result.changes === 0) throw new HttpError(404, '連結不存在')
  return { data: { deleted: result.changes } }
})

/* ---------------- site settings ---------------- */

route('PUT', 'admin/site', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const schema = z.object({
    site_title: z.string().trim().min(1).max(60),
    site_subtitle: z.string().trim().max(120).default(''),
    about_content: z.string().max(20000).default(''),
    site_logo: z.string().max(700000).default(''),
    icp_text: z.string().trim().max(60).default(''),
    icp_url: z.string().trim().max(300).default(''),
    icp_visible: z.boolean().default(true),
    police_text: z.string().trim().max(60).default(''),
    police_url: z.string().trim().max(300).default(''),
    police_visible: z.boolean().default(true),
    hero_title: z.string().trim().max(120).default(''),
    hero_intro: z.string().trim().max(60).default(''),
    hero_typed_words: z.string().trim().max(200).default(''),
    footer_badge: z.string().trim().max(60).default(''),
    footer_copyright: z.string().trim().max(120).default(''),
    footer_note: z.string().trim().max(120).default(''),
  })
  const parsed = schema.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '網站資料不完整')
  }
  const logo = parsed.data.site_logo
  if (logo) {
    const isDataUrl = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logo)
    const isUrl = /^https?:\/\/\S+$/.test(logo)
    if (!isDataUrl && !isUrl) {
      throw new HttpError(400, 'Logo 僅支援圖片檔案或圖片連結')
    }
  }
  // 備案資料：連結可為空（此時前台只顯示文字，不可點擊）
  if (parsed.data.icp_url) assertExternalUrl(parsed.data.icp_url)
  if (parsed.data.police_url) assertExternalUrl(parsed.data.police_url)
  const upsertSql =
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  await qBatch(db, [
    { sql: upsertSql, params: ['site_title', parsed.data.site_title] },
    { sql: upsertSql, params: ['site_subtitle', parsed.data.site_subtitle] },
    { sql: upsertSql, params: ['about_content', parsed.data.about_content] },
    { sql: upsertSql, params: ['site_logo', logo] },
    { sql: upsertSql, params: ['icp_text', parsed.data.icp_text] },
    { sql: upsertSql, params: ['icp_url', parsed.data.icp_url] },
    { sql: upsertSql, params: ['icp_visible', parsed.data.icp_visible ? '1' : '0'] },
    { sql: upsertSql, params: ['police_text', parsed.data.police_text] },
    { sql: upsertSql, params: ['police_url', parsed.data.police_url] },
    { sql: upsertSql, params: ['police_visible', parsed.data.police_visible ? '1' : '0'] },
    { sql: upsertSql, params: ['hero_title', parsed.data.hero_title] },
    { sql: upsertSql, params: ['hero_intro', parsed.data.hero_intro] },
    { sql: upsertSql, params: ['hero_typed_words', parsed.data.hero_typed_words] },
    { sql: upsertSql, params: ['footer_badge', parsed.data.footer_badge] },
    { sql: upsertSql, params: ['footer_copyright', parsed.data.footer_copyright] },
    { sql: upsertSql, params: ['footer_note', parsed.data.footer_note] },
  ])
  return { data: { message: '網站資料已更新' } }
})

/* ---------------- account ---------------- */

route('PUT', 'admin/account', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const schema = z.object({
    current_password: z.string().min(1, '請輸入當前密碼'),
    username: z.string().trim().min(2, '用戶名至少 2 個字元').max(30).optional(),
    new_password: z.string().min(6, '新密碼至少 6 位').max(64).optional(),
  })
  const parsed = schema.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '參數不合法')
  }
  const uid = ctx.auth!.uid
  const user = await qFirst<{ id: number; username: string; password_hash: string }>(
    db,
    'SELECT id, username, password_hash FROM users WHERE id = ?',
    uid,
  )
  if (!user) throw new HttpError(404, '帳號不存在')
  // 兼容兩種散列格式：pbkdf2（D1 版）與 bcrypt（Express 版）
  const matches = await (user.password_hash.startsWith('pbkdf2$')
    ? verifyPassword(parsed.data.current_password, user.password_hash)
    : Promise.resolve(bcrypt.compareSync(parsed.data.current_password, user.password_hash)))
  if (!matches) {
    // 用 400 而非 401：會話仍有效，避免觸發前端的全局登出
    throw new HttpError(400, '當前密碼不正確')
  }

  let username = user.username
  if (parsed.data.username && parsed.data.username !== user.username) {
    const exists = await qFirst(db, 'SELECT id FROM users WHERE username = ? AND id != ?', parsed.data.username, uid)
    if (exists) {
      throw new HttpError(409, '用戶名已被佔用')
    }
    await qRun(db, 'UPDATE users SET username = ? WHERE id = ?', parsed.data.username, uid)
    username = parsed.data.username
  }
  if (parsed.data.new_password) {
    await qRun(db, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(parsed.data.new_password), uid)
  }
  return {
    data: {
      token: await signToken({ uid, username }, jwtSecret(ctx.env)),
      username,
      message: '帳號資料已更新',
    },
  }
})

/* ---------------- nav menus & custom pages ---------------- */

const pagePayload = z.object({
  title: z.string().trim().min(1, '頁面標題不能為空').max(60),
  slug: z.string().trim().max(80).optional(),
  content: z.string().max(50000).default(''),
})

const menuCreatePayload = z.object({
  label: z.string().trim().min(1, '菜單名稱不能為空').max(30),
  type: z.enum(['system', 'group', 'page', 'link']),
  parent_id: z.number().int().nullable().optional(),
  system_path: z.string().trim().max(200).optional(),
  url: z.string().trim().max(500).optional(),
  page: pagePayload.optional(),
  visible: z.boolean().default(true),
})

const menuUpdatePayload = z.object({
  label: z.string().trim().min(1, '菜單名稱不能為空').max(30),
  visible: z.boolean().default(true),
  system_path: z.string().trim().max(200).optional(),
  url: z.string().trim().max(500).optional(),
  page: pagePayload.optional(),
})

async function uniquePageSlug(
  db: D1DatabaseLike,
  title: string,
  requested: string | undefined,
  excludeId?: number,
): Promise<string> {
  const base = slugify(requested || title)
  let candidate = base === 'post' ? `page-${randomSuffix()}` : base
  assertValidSlug(candidate)
  let attempt = 0
  while (true) {
    const row = excludeId
      ? await qFirst(db, 'SELECT id FROM custom_pages WHERE slug = ? AND id != ?', candidate, excludeId)
      : await qFirst(db, 'SELECT id FROM custom_pages WHERE slug = ?', candidate)
    if (!row) return candidate
    attempt += 1
    candidate = `${base}-${randomSuffix(4 + attempt)}`
  }
}

async function nextSortOrder(db: D1DatabaseLike, parentId: number | null): Promise<number> {
  const row = await qFirst<{ m: number | null }>(
    db,
    parentId === null
      ? 'SELECT MAX(sort_order) AS m FROM nav_menus WHERE parent_id IS NULL'
      : 'SELECT MAX(sort_order) AS m FROM nav_menus WHERE parent_id = ?',
    ...(parentId === null ? [] : [parentId]),
  )
  return (row?.m ?? 0) + 1
}

async function getGroupParent(db: D1DatabaseLike, parentId: number): Promise<void> {
  const parent = await qFirst<{ id: number; type: string }>(db, 'SELECT id, type FROM nav_menus WHERE id = ?', parentId)
  if (!parent) throw new HttpError(404, '上級菜單不存在')
  if (parent.type !== 'group') throw new HttpError(400, '只有「多頁分組」類型的菜單可以包含子菜單')
}

function assertSystemPath(path: string): void {
  if (!ALLOWED_SYSTEM_PATHS.includes(path)) throw new HttpError(400, '不支援的系統頁面路徑')
}

route('GET', 'admin/menus', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const rows = await qAll(
    ctx.env.DB,
    `SELECT m.*, p.title AS page_title, p.slug AS page_slug, p.content AS page_content
     FROM nav_menus m LEFT JOIN custom_pages p ON p.id = m.page_id
     ORDER BY m.parent_id IS NULL DESC, m.sort_order, m.id`,
  )
  return { data: rows }
})

route('POST', 'admin/menus', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const parsed = menuCreatePayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '參數不合法')
  }
  const p = parsed.data
  if (p.type === 'link') {
    if (!p.url) {
      throw new HttpError(400, '請填寫跳轉連結')
    }
    assertExternalUrl(p.url)
  }
  if (p.type === 'system') {
    if (!p.system_path) {
      throw new HttpError(400, '請選擇系統頁面')
    }
    assertSystemPath(p.system_path)
  }
  if (p.type === 'page' && !p.page) {
    throw new HttpError(400, '請填寫單頁內容')
  }
  if (p.type === 'group' && p.parent_id) {
    throw new HttpError(400, '分組下不能再嵌套分組')
  }
  if (p.parent_id) await getGroupParent(db, p.parent_id)

  let pageId: number | null = null
  if (p.type === 'page' && p.page) {
    const slug = await uniquePageSlug(db, p.page.title, p.page.slug)
    const result = await qRun(db, 'INSERT INTO custom_pages (title, slug, content) VALUES (?, ?, ?)', p.page.title, slug, p.page.content)
    pageId = Number(result.lastRowId)
  }

  const result = await qRun(
    db,
    'INSERT INTO nav_menus (parent_id, label, type, system_path, page_id, url, sort_order, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    p.parent_id ?? null,
    p.label,
    p.type,
    p.type === 'system' ? (p.system_path ?? '') : '',
    pageId,
    p.type === 'link' ? (p.url ?? '') : '',
    await nextSortOrder(db, p.parent_id ?? null),
    p.visible ? 1 : 0,
  )
  return { data: { id: Number(result.lastRowId) }, code: 201 }
})

route('PUT', 'admin/menus/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const row = await qFirst<{ id: number; type: string; page_id: number | null }>(
    db,
    'SELECT * FROM nav_menus WHERE id = ?',
    id,
  )
  if (!row) throw new HttpError(404, '菜單不存在')

  const parsed = menuUpdatePayload.safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '參數不合法')
  }
  const p = parsed.data

  if (row.type === 'link') {
    if (!p.url) {
      throw new HttpError(400, '請填寫跳轉連結')
    }
    assertExternalUrl(p.url)
    await qRun(db, 'UPDATE nav_menus SET url = ? WHERE id = ?', p.url, id)
  }
  if (row.type === 'system') {
    if (p.system_path) {
      assertSystemPath(p.system_path)
      await qRun(db, 'UPDATE nav_menus SET system_path = ? WHERE id = ?', p.system_path, id)
    }
  }
  if (row.type === 'page') {
    if (!p.page || !row.page_id) {
      throw new HttpError(400, '頁面內容缺失')
    }
    const existing = await qFirst<{ id: number; slug: string }>(
      db,
      'SELECT id, title, slug FROM custom_pages WHERE id = ?',
      row.page_id,
    )
    if (!existing) throw new HttpError(404, '頁面不存在')
    const slug = await uniquePageSlug(db, p.page.title, p.page.slug, existing.id)
    await qRun(
      db,
      "UPDATE custom_pages SET title = ?, slug = ?, content = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      p.page.title,
      slug,
      p.page.content,
      existing.id,
    )
  }
  await qRun(db, 'UPDATE nav_menus SET label = ?, visible = ? WHERE id = ?', p.label, p.visible ? 1 : 0, id)
  return { data: { id } }
})

route('PATCH', 'admin/menus/:id/move', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const id = Number(ctx.params.id)
  const parsed = z.object({ direction: z.enum(['up', 'down']) }).safeParse(await ctx.body())
  if (!parsed.success) {
    throw new HttpError(400, '方向參數不合法')
  }
  const row = await qFirst<{ id: number; parent_id: number | null; sort_order: number }>(
    db,
    'SELECT id, parent_id, sort_order FROM nav_menus WHERE id = ?',
    id,
  )
  if (!row) throw new HttpError(404, '菜單不存在')

  const siblings = await qAll<{ id: number; sort_order: number }>(
    db,
    'SELECT id, sort_order FROM nav_menus WHERE parent_id IS ? ORDER BY sort_order, id',
    row.parent_id,
  )
  const idx = siblings.findIndex((s) => s.id === id)
  const swapWith = parsed.data.direction === 'up' ? siblings[idx - 1] : siblings[idx + 1]
  if (!swapWith) {
    return { data: { id } }
  }
  await qBatch(db, [
    { sql: 'UPDATE nav_menus SET sort_order = ? WHERE id = ?', params: [swapWith.sort_order, row.id] },
    { sql: 'UPDATE nav_menus SET sort_order = ? WHERE id = ?', params: [row.sort_order, swapWith.id] },
  ])
  return { data: { id } }
})

route('DELETE', 'admin/menus/:id', async (ctx: RouteCtx): Promise<HandlerResult> => {
  const db = ctx.env.DB
  const row = await qFirst<{ id: number; type: string; page_id: number | null }>(
    db,
    'SELECT id, type, page_id FROM nav_menus WHERE id = ?',
    Number(ctx.params.id),
  )
  if (!row) throw new HttpError(404, '菜單不存在')
  if (row.type === 'page' && row.page_id) {
    // 刪除單頁會級聯刪除關聯菜單
    await qRun(db, 'DELETE FROM custom_pages WHERE id = ?', row.page_id)
  } else {
    await qRun(db, 'DELETE FROM nav_menus WHERE id = ?', row.id)
  }
  return { data: { deleted: 1 } }
})

}
