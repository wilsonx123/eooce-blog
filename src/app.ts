import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.js'
import publicRouter from './routes/public.js'
import adminRouter from './routes/admin.js'
import seoRouter from './routes/seo.js'
import { db } from './db/database.js'
import { fail } from './utils/response.js'
import { HttpError } from './utils/response.js'
import { seedNavIfEmpty } from './db/seed.js'

export function createApp() {
  // 應用創建時確保預設導航存在（冪等），測試環境同樣生效
  seedNavIfEmpty()
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  // API 響應禁止瀏覽器快取：網站標題/菜單等設定修改後必須立即生效
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.use('/api/auth', authRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api', publicRouter)
  // SEO：sitemap 與 robots 須在下方 SPA 回退（萬用正則）之前註冊
  app.use(seoRouter)

  app.use('/api', (_req, res) => {
    fail(res, 404, '介面不存在')
  })

  // 生產模式：若存在前端構建產物則託管靜態資源，並支援 SPA 回退
  const webDist =
    process.env.WEB_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist')
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    // index.html 由下方回退處理器注入網站設定，靜態服務不直接返回它
    app.use(express.static(webDist, { index: false }))

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    // 伺服器端替換 meta description 為網站副標題；<title> 由前端加載網站設定後動態更新（見 web/src/utils/title.ts）
    const renderIndex = (): string => {
      const settings = db
        .prepare("SELECT key, value FROM site_settings WHERE key IN ('site_title','site_subtitle')")
        .all() as Array<{ key: string; value: string }>
      const map = Object.fromEntries(settings.map((r) => [r.key, r.value]))
      return fs
        .readFileSync(path.join(webDist, 'index.html'), 'utf8')
        .replace(
          /(name="description" content=")[^"]*(")/,
          `$1${esc(map.site_subtitle || '代碼與文字的棲息地，記錄前端工程、後端架構與設計思考')}$2`,
        )
    }

    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
      try {
        res.set('Cache-Control', 'no-store')
        res.type('html').send(renderIndex())
      } catch {
        res.set('Cache-Control', 'no-store')
        res.sendFile(path.join(webDist, 'index.html'))
      }
    })
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      fail(res, err.status, err.message)
      return
    }
    if (err instanceof SyntaxError && 'body' in (err as unknown as Record<string, unknown>)) {
      fail(res, 400, '請求體格式錯誤')
      return
    }
    console.error('[error]', err)
    fail(res, 500, '伺服器內部錯誤')
  })

  return app
}
