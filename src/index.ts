import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { seedIfEmpty, seedNavIfEmpty } from './db/seed.js'

seedIfEmpty()
seedNavIfEmpty()

const app = createApp()
const PORT = Number(process.env.PORT) || 3001

app.listen(PORT, () => {
  console.log(`[blog] API server listening on http://localhost:${PORT}`)

  const webDist =
    process.env.WEB_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist')
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    console.log(`[blog] frontend served from ${webDist}`)
  } else {
    console.warn('[blog] 未檢測到前端構建產物 (web/dist)，當前僅提供 /api 介面，前台頁面無法訪問。')
    console.warn('[blog] 請先執行: npm run setup（首次安裝依賴）然後 npm run build（構建前端），或使用 Docker 部署。')
  }
})
