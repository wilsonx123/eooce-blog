import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

// 開發模式下從根目錄資料庫讀取網站設定，注入 index.html 的標題與描述
// （與生產環境 Express 的注入行為一致，避免首屏標題閃爍）
const nodeRequire = createRequire(import.meta.url)
const rootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

let cachedTitle = ''
let cachedSubtitle = ''
let cachedAt = 0

function getSiteMeta(): { title: string; subtitle: string } {
  if (Date.now() - cachedAt < 3000) return { title: cachedTitle, subtitle: cachedSubtitle }
  try {
    const Database = nodeRequire('better-sqlite3')
    const db = new Database(path.join(rootDir, 'data', 'blog.db'), { readonly: true, fileMustExist: false })
    const rows = db
      .prepare("SELECT key, value FROM site_settings WHERE key IN ('site_title','site_subtitle')")
      .all() as Array<{ key: string; value: string }>
    db.close()
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    cachedTitle = map.site_title || 'LittleCLS'
    cachedSubtitle = map.site_subtitle || ''
    cachedAt = Date.now()
  } catch {
    cachedTitle = ''
    cachedSubtitle = ''
  }
  return { title: cachedTitle, subtitle: cachedSubtitle }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function injectSiteMeta(): Plugin {
  return {
    name: 'inject-site-meta',
    transformIndexHtml(html) {
      // 僅注入 meta description；<title> 以 index.html 原文為準
      const { subtitle } = getSiteMeta()
      if (subtitle) return html.replace(/(name="description" content=")[^"]*(")/, `$1${esc(subtitle)}$2`)
      return html
    },
  }
}

export default defineConfig({
  plugins: [vue(), injectSiteMeta()],
  build: {
    rollupOptions: {
      output: {
        // 將後台文章編輯器（md-editor-v3 及其編碼/高亮依賴）拆成獨立 chunk：
        // 編輯器僅在後台路由延遲載入，獨立 chunk 令其餘代碼更新時編輯器快取不失效
        manualChunks: {
          editor: ['md-editor-v3'],
        },
      },
    },
    // md-editor-v3 屬後台專用且延遲載入，體積已知且可接受，放寬單 chunk 提示閾值
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // true = 允許任意域名訪問開發伺服器（預設僅允許 localhost 與 IP）
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
