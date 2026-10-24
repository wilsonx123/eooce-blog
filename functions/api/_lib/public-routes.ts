/** 公開路由（與 Express 版 src/routes/public.ts 一致） */
import { z } from 'zod'
import { route, type HandlerResult, type RouteCtx } from './router'
import { HttpError } from './http'
import { qAll, qFirst, qRun } from './db'
import { likePattern } from './search'

interface PostRow {
  id: number
  title: string
  slug: string
  summary: string
  content: string
  cover_image: string
  category_id: number | null
  status: string
  pinned: number
  views: number
  reading_minutes: number
  published_at: string | null
  created_at: string
  updated_at: string
  category_name: string | null
  category_slug: string | null
}

interface TagAttachment {
  name: string
  slug: string
}

async function attachTags(
  db: D1DatabaseLike,
  posts: PostRow[],
): Promise<Array<PostRow & { tags: TagAttachment[] }>> {
  if (posts.length === 0) return []
  const ids = posts.map((p) => p.id)
  const placeholders = ids.map(() => '?').join(',')
  const rows = await qAll<{ post_id: number; name: string; slug: string }>(
    db,
    `SELECT pt.post_id, t.name, t.slug FROM post_tags pt
     JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id IN (${placeholders}) ORDER BY t.name`,
    ...ids,
  )
  const map = new Map<number, TagAttachment[]>()
  for (const r of rows) {
    const list = map.get(r.post_id) ?? []
    list.push({ name: r.name, slug: r.slug })
    map.set(r.post_id, list)
  }
  return posts.map((p) => ({ ...p, tags: map.get(p.id) ?? [] }))
}

const POST_LIST_FIELDS = `p.id, p.title, p.slug, p.summary, p.cover_image, p.category_id,
  p.status, p.pinned, p.views, p.reading_minutes, p.published_at, p.created_at, p.updated_at,
  c.name AS category_name, c.slug AS category_slug`

const commentSchema = z.object({
  nickname: z.string().trim().min(1, '暱稱不能為空').max(30),
  email: z.string().trim().email('電郵格式不正確').max(100),
  content: z.string().trim().min(1, '評論內容不能為空').max(1000),
})

export function registerPublicRoutes(): void {
  route('GET', 'posts', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const db = ctx.env.DB
    const url = ctx.url
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 9))
    const category = url.searchParams.get('category')
    const tag = url.searchParams.get('tag')
    const search = (url.searchParams.get('search') ?? '').trim()

    const where: string[] = ["p.status = 'published'"]
    const params: unknown[] = []

    if (category) {
      where.push('c.slug = ?')
      params.push(category)
    }
    if (tag) {
      where.push(
        'p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.slug = ?)',
      )
      params.push(tag)
    }
    if (search) {
      const like = likePattern(search)
      where.push(
        `(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\' OR p.summary LIKE ? ESCAPE '\\')`,
      )
      params.push(like, like, like)
    }

    const whereSql = where.join(' AND ')
    const totalRow = await qFirst<{ c: number }>(
      db,
      `SELECT COUNT(*) AS c FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`,
      ...params,
    )

    const rows = await qAll<PostRow>(
      db,
      `SELECT ${POST_LIST_FIELDS} FROM posts p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${whereSql}
       ORDER BY p.pinned DESC, p.published_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    )

    return { data: { list: await attachTags(db, rows), total: totalRow?.c ?? 0, page, pageSize } }
  })

  route('GET', 'posts/:slug', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const db = ctx.env.DB
    const post = await qFirst<PostRow>(
      db,
      `SELECT ${POST_LIST_FIELDS}, p.content FROM posts p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.status = 'published'`,
      ctx.params.slug,
    )
    if (!post) {
      throw new HttpError(404, '文章不存在或未發佈')
    }

    await qRun(db, 'UPDATE posts SET views = views + 1 WHERE id = ?', post.id)
    post.views += 1

    const tags = await qAll<{ name: string; slug: string }>(
      db,
      'SELECT t.name, t.slug FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ? ORDER BY t.name',
      post.id,
    )

    const prev = await qFirst<{ title: string; slug: string }>(
      db,
      `SELECT title, slug FROM posts WHERE status = 'published' AND published_at < ?
       ORDER BY published_at DESC LIMIT 1`,
      post.published_at,
    )
    const next = await qFirst<{ title: string; slug: string }>(
      db,
      `SELECT title, slug FROM posts WHERE status = 'published' AND published_at > ?
       ORDER BY published_at ASC LIMIT 1`,
      post.published_at,
    )

    return { data: { ...post, tags, prev: prev ?? null, next: next ?? null } }
  })

  route('GET', 'posts/:slug/comments', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const post = await qFirst<{ id: number }>(
      ctx.env.DB,
      "SELECT id FROM posts WHERE slug = ? AND status = 'published'",
      ctx.params.slug,
    )
    if (!post) {
      throw new HttpError(404, '文章不存在或未發佈')
    }
    const list = await qAll(
      ctx.env.DB,
      `SELECT id, nickname, content, created_at FROM comments
       WHERE post_id = ? AND status = 'approved' ORDER BY created_at DESC`,
      post.id,
    )
    return { data: list }
  })

  route('POST', 'posts/:slug/comments', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const db = ctx.env.DB
    const post = await qFirst<{ id: number }>(
      db,
      "SELECT id FROM posts WHERE slug = ? AND status = 'published'",
      ctx.params.slug,
    )
    if (!post) {
      throw new HttpError(404, '文章不存在或未發佈')
    }
    const parsed = commentSchema.safeParse(await ctx.body())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? '評論資料不完整')
    }
    const { nickname, email, content } = parsed.data
    await qRun(db, 'INSERT INTO comments (post_id, nickname, email, content) VALUES (?, ?, ?, ?)', post.id, nickname, email, content)
    return { data: { message: '評論提交成功，審核通過後將展示' }, code: 201 }
  })

  /* ---------------- guestbook ---------------- */

  route('GET', 'guestbook', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const list = await qAll(
      ctx.env.DB,
      `SELECT id, nickname, content, created_at FROM guestbook_messages
       WHERE status = 'approved' ORDER BY created_at DESC LIMIT 100`,
    )
    return { data: list }
  })

  route('POST', 'guestbook', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const db = ctx.env.DB
    const parsed = commentSchema.safeParse(await ctx.body())
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? '留言資料不完整')
    }
    const { nickname, email, content } = parsed.data
    await qRun(db, 'INSERT INTO guestbook_messages (nickname, email, content) VALUES (?, ?, ?)', nickname, email, content)
    return { data: { message: '留言提交成功，審核通過後將展示' }, code: 201 }
  })

  /* ---------------- friend links ---------------- */

  route('GET', 'links', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const list = await qAll(
      ctx.env.DB,
      'SELECT id, name, url, description FROM friend_links WHERE visible = 1 ORDER BY sort_order, id',
    )
    return { data: list }
  })

  route('GET', 'categories', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const list = await qAll(
      ctx.env.DB,
      `SELECT c.id, c.name, c.slug, c.description, c.sort_order, COUNT(p.id) AS post_count
       FROM categories c
       LEFT JOIN posts p ON p.category_id = c.id AND p.status = 'published'
       GROUP BY c.id ORDER BY c.sort_order, post_count DESC, c.name`,
    )
    return { data: list }
  })

  route('GET', 'tags', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const list = await qAll(
      ctx.env.DB,
      `SELECT t.id, t.name, t.slug, t.is_center, COUNT(pt.post_id) AS post_count
       FROM tags t
       LEFT JOIN post_tags pt ON pt.tag_id = t.id
       LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
       GROUP BY t.id ORDER BY post_count DESC, t.name`,
    )
    return { data: list }
  })

  route('GET', 'archives', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const rows = await qAll<{ title: string; slug: string; published_at: string; views: number; month: string }>(
      ctx.env.DB,
      `SELECT p.title, p.slug, p.published_at, p.views,
         substr(p.published_at, 1, 7) AS month
       FROM posts p WHERE p.status = 'published'
       ORDER BY p.published_at DESC`,
    )
    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      const list = groups.get(r.month) ?? []
      list.push(r)
      groups.set(r.month, list)
    }
    return {
      data: {
        total: rows.length,
        groups: Array.from(groups.entries()).map(([month, posts]) => ({ month, posts })),
      },
    }
  })

  route('GET', 'site', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const rows = await qAll<{ key: string; value: string }>(ctx.env.DB, 'SELECT key, value FROM site_settings')
    const site: Record<string, string> = {}
    for (const r of rows) site[r.key] = r.value
    return { data: site }
  })

  route('GET', 'nav', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const rows = await qAll<{
      id: number
      parent_id: number | null
      label: string
      type: string
      system_path: string
      url: string
      page_slug: string | null
    }>(
      ctx.env.DB,
      `SELECT m.id, m.parent_id, m.label, m.type, m.system_path, m.url, p.slug AS page_slug
       FROM nav_menus m LEFT JOIN custom_pages p ON p.id = m.page_id
       WHERE m.visible = 1
       ORDER BY m.parent_id IS NULL DESC, m.sort_order, m.id`,
    )

    interface NavNode {
      id: number
      label: string
      type: string
      to: string
      url: string
      open_new_tab: boolean
      children: NavNode[]
    }
    const map = new Map<number, NavNode>()
    const roots: NavNode[] = []
    for (const r of rows) {
      const node: NavNode = {
        id: r.id,
        label: r.label,
        type: r.type,
        to: r.type === 'page' ? `/page/${r.page_slug ?? ''}` : r.type === 'system' ? r.system_path : '',
        url: r.type === 'link' ? r.url : '',
        open_new_tab: r.type === 'link',
        children: [],
      }
      map.set(r.id, node)
      const parent = r.parent_id ? map.get(r.parent_id) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return { data: roots }
  })

  route('GET', 'pages/:slug', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const page = await qFirst<{ title: string; content: string; updated_at: string }>(
      ctx.env.DB,
      'SELECT title, content, updated_at FROM custom_pages WHERE slug = ?',
      ctx.params.slug,
    )
    if (!page) throw new HttpError(404, '頁面不存在')
    return { data: page }
  })
}
