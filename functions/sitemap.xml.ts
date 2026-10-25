/**
 * sitemap.xml（Pages Functions 版，與 Express 版 src/routes/seo.ts 行為一致）：
 * 收錄首頁與主要清單頁、全部已發佈文章、分類、標籤與自訂頁面，供搜尋引擎抓取。
 */
import { ensureSchema } from './api/_lib/seed'
import { qAll } from './api/_lib/db'

/** SQLite 的 'YYYY-MM-DD HH:MM:SS' → sitemap 需要的 'YYYY-MM-DD' */
const dateOnly = (value: string | null | undefined): string => (value ? String(value).slice(0, 10) : '')

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const onRequestGet = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  await ensureSchema(ctx.env.DB)
  const origin = new URL(ctx.request.url).origin
  const urls: string[] = []
  const add = (path: string, lastmod = '', priority = '0.6', changefreq = 'weekly'): void => {
    urls.push(
      `  <url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}` +
        `<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
    )
  }

  add('/', '', '1.0')
  for (const path of ['/categories', '/tags', '/archives', '/about', '/guestbook']) add(path, '', '0.6')

  const posts = await qAll<{ slug: string; last: string | null }>(
    ctx.env.DB,
    `SELECT slug, COALESCE(published_at, updated_at) AS last
     FROM posts WHERE status = 'published' ORDER BY published_at DESC`,
  )
  for (const p of posts) add(`/post/${p.slug}`, dateOnly(p.last), '0.8', 'monthly')

  const categories = await qAll<{ slug: string }>(ctx.env.DB, 'SELECT slug FROM categories ORDER BY sort_order, id')
  for (const c of categories) add(`/category/${c.slug}`, '', '0.5')

  const tags = await qAll<{ slug: string }>(ctx.env.DB, 'SELECT slug FROM tags ORDER BY id')
  for (const t of tags) add(`/tag/${t.slug}`, '', '0.4')

  const pages = await qAll<{ slug: string; updated_at: string }>(
    ctx.env.DB,
    'SELECT slug, updated_at FROM custom_pages ORDER BY id',
  )
  for (const p of pages) add(`/page/${p.slug}`, dateOnly(p.updated_at), '0.5')

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
