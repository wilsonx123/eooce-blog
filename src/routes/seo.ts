/**
 * sitemap.xml 與 robots.txt（Express 版，與 Pages Functions 版 functions/sitemap.xml.ts、
 * functions/robots.txt.ts 行為一致）：收錄首頁與主要清單頁、全部已發佈文章、分類、標籤與自訂頁面。
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { db } from '../db/database.js'

const router = Router()

/** SQLite 的 'YYYY-MM-DD HH:MM:SS' → sitemap 需要的 'YYYY-MM-DD' */
const dateOnly = (value: string | null | undefined): string => (value ? String(value).slice(0, 10) : '')

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const siteOrigin = (req: Request): string => `${req.protocol}://${req.get('host') ?? 'localhost'}`

router.get('/sitemap.xml', (req: Request, res: Response) => {
  const origin = siteOrigin(req)
  const urls: string[] = []
  const add = (path: string, lastmod = '', priority = '0.6', changefreq = 'weekly'): void => {
    urls.push(
      `  <url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}` +
        `<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
    )
  }

  add('/', '', '1.0')
  for (const path of ['/categories', '/tags', '/archives', '/about', '/guestbook']) add(path, '', '0.6')

  const posts = db
    .prepare(
      `SELECT slug, COALESCE(published_at, updated_at) AS last
       FROM posts WHERE status = 'published' ORDER BY published_at DESC`,
    )
    .all() as Array<{ slug: string; last: string | null }>
  for (const p of posts) add(`/post/${p.slug}`, dateOnly(p.last), '0.8', 'monthly')

  const categories = db.prepare('SELECT slug FROM categories ORDER BY sort_order, id').all() as Array<{ slug: string }>
  for (const c of categories) add(`/category/${c.slug}`, '', '0.5')

  const tags = db.prepare('SELECT slug FROM tags ORDER BY id').all() as Array<{ slug: string }>
  for (const t of tags) add(`/tag/${t.slug}`, '', '0.4')

  const pages = db.prepare('SELECT slug, updated_at FROM custom_pages ORDER BY id').all() as Array<{
    slug: string
    updated_at: string
  }>
  for (const p of pages) add(`/page/${p.slug}`, dateOnly(p.updated_at), '0.5')

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(xml)
})

router.get('/robots.txt', (req: Request, res: Response) => {
  const origin = siteOrigin(req)
  const body = ['User-agent: *', 'Disallow: /home', 'Disallow: /search', '', `Sitemap: ${origin}/sitemap.xml`, ''].join(
    '\n',
  )
  res.set('Cache-Control', 'public, max-age=3600').type('text/plain').send(body)
})

export default router
