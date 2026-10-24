import bcrypt from 'bcryptjs'
import { db, now } from './database.js'

const DEFAULT_NAV: Array<{ label: string; path: string }> = [
  { label: '首頁', path: '/' },
  { label: '分類', path: '/categories' },
  { label: '標籤', path: '/tags' },
  { label: '歸檔', path: '/archives' },
  { label: '關於', path: '/about' },
]

/** 已有資料庫升級時補充預設導航（僅當菜單表為空） */
export function seedNavIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM nav_menus').get() as { c: number }).c
  if (count > 0) return
  const ins = db.prepare('INSERT INTO nav_menus (label, type, system_path, sort_order) VALUES (?, ?, ?, ?)')
  DEFAULT_NAV.forEach((n, i) => ins.run(n.label, 'system', n.path, i + 1))
  console.log(`[seed] default nav menus seeded at ${now()}`)
}

export function seedIfEmpty(): void {
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  if (userCount > 0) return

  const seed = db.transaction(() => {
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
      'admin',
      bcrypt.hashSync('admin123', 10),
    )

    const settings = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)')
    settings.run('site_title', 'LittleCLS')
    settings.run('site_subtitle', 'Just For Fun')
    settings.run('about_content', `## 關於我

你好，歡迎來到 **LittleCLS**。

我是一名全棧工程師，白天寫代碼，晚上寫字。這裏記錄我在前端工程、後端架構與產品設計路上的思考與實踐。

### 我關注的方向

- **前端工程**：Vue 生態、TypeScript、效能優化與工程化體系
- **後端架構**：Node.js 服務、資料庫設計與高可用實踐
- **設計思維**：介面美學、互動細節與用戶體驗

### 聯繫方式

- 電郵：hello\@shanyue.dev
- GitHub：[github.com/shanyue](https://github.com)

> 紙上得來終覺淺，絕知此事要躬行。`)

    const cat = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)')
    cat.run('前端開發', 'frontend', '瀏覽器端的一切：框架、工程化與體驗優化')
    cat.run('後端架構', 'backend', '服務端設計與實踐：API、資料庫與穩定性')
    cat.run('設計思維', 'design', '介面美學與用戶體驗的思考')
    cat.run('隨筆', 'essay', '生活記錄與技術之外的雜談')

    const tag = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)')
    tag.run('Vue', 'vue')
    tag.run('TypeScript', 'typescript')
    tag.run('Node.js', 'nodejs')
    tag.run('SQLite', 'sqlite')
    tag.run('UI 設計', 'ui-design')
    tag.run('工程化', 'engineering')
    tag.run('效能優化', 'performance')

    const catId = (slug: string) =>
      (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) as { id: number }).id
    const tagId = (slug: string) =>
      (db.prepare('SELECT id FROM tags WHERE slug = ?').get(slug) as { id: number }).id

    const insPost = db.prepare(`INSERT INTO posts
      (title, slug, summary, content, cover_image, category_id, status, pinned, views, reading_minutes, published_at, created_at, updated_at)
      VALUES (@title, @slug, @summary, @content, '', @category_id, @status, @pinned, @views, @reading_minutes, @published_at, @created_at, @created_at)`)
    const insPostTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)')

    const posts: Array<{
      title: string
      slug: string
      summary: string
      content: string
      category: string
      tags: string[]
      status: 'published' | 'draft'
      pinned?: number
      views: number
      daysAgo: number
    }> = [
      {
        title: '從零搭建一套現代化的 Vue 3 博客系統',
        slug: 'build-modern-vue3-blog',
        summary:
          '本文以一個真實項目為例，講解如何用 Vue 3 + Vite + Tailwind CSS 構建一個兼顧美感與效能的博客系統，涵蓋架構設計、Markdown 渲染與深色主題實現。',
        content: `# 從零搭建一套現代化的 Vue 3 博客系統

寫博客是工程師沉澱技術最好的方式之一。這篇文章記錄我用 **Vue 3 + Vite + Tailwind CSS** 從零搭建博客的完整過程。

## 技術選型

選擇技術棧時我遵循三個原則：

1. **類型安全優先**：TypeScript 從第一行代碼就參與
2. **構建即體驗**：Vite 的毫秒級 HMR 讓開發過程愉悦
3. **樣式可控**：Tailwind 的原子類讓設計系統隨寫隨用

## 項目結構

\`\`\`typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
\`\`\`

## Markdown 渲染方案

博客的核心是文章排版。我選擇在後端儲存原始 Markdown，在前端使用 \`markdown-it\` 渲染：

- 支援 GFM 表格與任務列表
- 代碼塊使用 highlight.js 高亮
- 標題自動生成錨點，側邊目錄可跳轉

## 深色主題

深色模式已成為現代博客的標配。實現上通過給根元素切換 \`dark\` class，配合 Tailwind 的 \`darkMode: 'class'\` 即可，用戶的偏好持久化到 localStorage。

> 好的博客系統應該讓作者專注寫作，讓讀者專注閲讀。`,
        category: 'frontend',
        tags: ['vue', 'typescript', 'engineering'],
        status: 'published',
        pinned: 1,
        views: 1284,
        daysAgo: 2,
      },
      {
        title: '用 better-sqlite3 打造輕量級內容服務',
        slug: 'better-sqlite3-content-service',
        summary:
          'SQLite 不只是移動端玩具。藉助 better-sqlite3 的同步 API 與 WAL 模式，中小型內容網站可以獲得極簡部署與出色效能的雙重收益。',
        content: `# 用 better-sqlite3 打造輕量級內容服務

對於個人博客、文檔站這類寫少讀多的場景，SQLite 是被低估的選擇。

## 為什麼選 SQLite

- **零部署**：資料庫就是一個檔案，備份即複製
- **效能足夠**：WAL 模式下讀效能遠超預期
- **類型嚴格**：CHECK 約束讓髒數據無處藏身

## WAL 模式

\`\`\`typescript
import Database from 'better-sqlite3'

const db = new Database('blog.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
\`\`\`

## 事務與原子操作

瀏覽量自增這類高頻寫操作，直接用 SQL 表達式保證原子性：

\`\`\`typescript
db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id)
\`\`\`

這樣避免了先讀後寫的競態條件，一個語句完成全部工作。`,
        category: 'backend',
        tags: ['nodejs', 'sqlite'],
        status: 'published',
        views: 862,
        daysAgo: 5,
      },
      {
        title: '博客設計的留白美學',
        slug: 'whitespace-aesthetics-in-blog-design',
        summary:
          '排版是閲讀體驗的一半。從行高、字距到版心寬度，聊聊那些讓長文閲讀變舒服的細節設計決策。',
        content: `# 博客設計的留白美學

文字是內容的主角，設計的工作是讓主角登場時不被干擾。

## 版心寬度

一行文字的理想長度是 **65~75 個字元**。超過這個範圍，視線換行時容易串行；過短則眼睛頻繁折返，節奏被打破。

## 行高與字距

中文長文的行高建議在 1.8 左右，段間距大於行距，讓段落有呼吸感。

## 層級靠對比

標題的層級感來自字號、字重與顏色的三重對比。克制使用顏色，一頁內強調色不超過兩種。

\`\`\`css
.article {
  max-width: 42rem;
  line-height: 1.8;
  letter-spacing: 0.01em;
}
\`\`\`

設計到最後，去掉的往往比加上的更有價值。`,
        category: 'design',
        tags: ['ui-design'],
        status: 'published',
        views: 534,
        daysAgo: 9,
      },
      {
        title: 'TypeScript 類型體操的實用邊界',
        slug: 'typescript-type-gymnastics-practical-boundary',
        summary:
          '類型體操不是為了炫技。這篇文章梳理日常項目中最值得使用的五類高級類型技巧，以及應該停手的時機。',
        content: `# TypeScript 類型體操的實用邊界

類型系統的價值在於把運行時錯誤提前到編譯期。但投入要有邊界。

## 值得寫的類型

\`\`\`typescript
// 1. 從值推斷字面量聯合
const ROUTES = ['/home', '/posts', '/about'] as const
type Route = (typeof ROUTES)[number]

// 2. 模板字面量類型做路徑校驗
type ApiPath = \`/api/\${'posts' | 'tags'}/\${string}\`

// 3. Discriminated Union 消滅 if 判斷地獄
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }
\`\`\`

## 什麼時候停手

當類型代碼超過業務代碼、當同事需要十分鐘讀懂一個類型簽名，就是該用簡單寫法的時刻。

類型是工具，可維護性才是目的。`,
        category: 'frontend',
        tags: ['typescript'],
        status: 'published',
        views: 721,
        daysAgo: 14,
      },
      {
        title: '我如何用 REST API 組織博客後台',
        slug: 'organize-blog-admin-rest-api',
        summary:
          '統一的響應結構、清晰的資源劃分與一致的錯誤語義，是後台管理系統能否順暢協作的關鍵。分享我的 API 設計清單。',
        content: `# 我如何用 REST API 組織博客後台

後台管理系統 API 設計最重要的是**一致性**。

## 統一響應結構

\`\`\`json
{
  "code": 200,
  "data": { "list": [], "total": 0 },
  "message": "ok"
}
\`\`\`

前端只需要寫一次攔截器，就能處理全部成功與失敗分支。

## 資源劃分

- 公開資源掛在 \`/api\` 下，匿名可讀
- 管理資源掛在 \`/api/admin\` 下，JWT 中間件統一校驗
- 狀態變更用 PATCH 語義，如 \`PATCH /posts/:id/status\`

## 錯誤語義

400 給參數校驗，401 給未登入，404 給不存在的資源，409 給唯一性衝突。語義準確比籠統的 500 有用得多。`,
        category: 'backend',
        tags: ['nodejs', 'engineering'],
        status: 'published',
        views: 445,
        daysAgo: 21,
      },
      {
        title: '山間半日：寫作與代碼的共同節奏',
        slug: 'mountain-half-day-essay',
        summary:
          '寫代碼和寫文章，本質都是把混沌的想法整理成清晰的結構。週末進山走了半日，想了想這兩件事的共同點。',
        content: `# 山間半日：寫作與代碼的共同節奏

週六清早上山，走到半山腰的茶亭坐下，什麼也不做，就看着霧從谷底慢慢升起來。

寫代碼和寫文章，本質上是一件事：**把混沌的想法整理成清晰的結構**。

## 結構先行

代碼先想清楚模塊邊界再動手，文章先列大綱再填肉。跳過結構直接堆細節，返工只是時間問題。

## 節奏感

寫代碼有狀態，寫文章也是。狀態好的時候一氣呵成，狀態差的時候寧可去山裏走走。

> 步子放慢一點，路反而走得更遠。`,
        category: 'essay',
        tags: [],
        status: 'published',
        views: 298,
        daysAgo: 30,
      },
      {
        title: '（草稿）Vite 插件機制的深度剖析',
        slug: 'vite-plugin-mechanism-deep-dive',
        summary: '從 dev server 的中間件模型到 Rollup 兼容層，逐步拆解 Vite 插件在開發與構建兩條鏈路中的行為差異。',
        content: `# Vite 插件機制的深度剖析

> 草稿筆記，尚未完成。

## Dev 階段

Vite dev server 本質是一個 connect 中間件棧，插件通過 \`configureServer\` 鈎子介入。

## Build 階段

構建時 Vite 切換到 Rollup 生態，插件寫法需要注意兼容性差異。`,
        category: 'frontend',
        tags: ['engineering', 'performance'],
        status: 'draft',
        views: 0,
        daysAgo: 1,
      },
    ]

    for (const p of posts) {
      const published = new Date()
      published.setDate(published.getDate() - p.daysAgo)
      const dateStr = published.toISOString().replace('T', ' ').slice(0, 19)
      const result = insPost.run({
        title: p.title,
        slug: p.slug,
        summary: p.summary,
        content: p.content,
        category_id: catId(p.category),
        status: p.status,
        pinned: p.pinned ?? 0,
        views: p.views,
        reading_minutes: Math.max(1, Math.round(p.content.length / 500)),
        published_at: p.status === 'published' ? dateStr : null,
        created_at: dateStr,
      } as Record<string, unknown>)
      for (const t of p.tags) insPostTag.run(result.lastInsertRowid, tagId(t))
    }

    const postId = (slug: string) =>
      (db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug) as { id: number }).id
    const insComment = db.prepare('INSERT INTO comments (post_id, nickname, email, content, status) VALUES (?, ?, ?, ?, ?)')
    insComment.run(postId('build-modern-vue3-blog'), '晨風', 'chenfeng@example.com', '寫得很有條理，深色主題部分正好解決了我的困惑，期待後續系列！', 'approved')
    insComment.run(postId('build-modern-vue3-blog'), '林間有風', 'lin@example.com', '請問 Markdown 目錄錨點是如何生成的？會在下篇文章展開嗎？', 'approved')
    insComment.run(postId('better-sqlite3-content-service'), '阿哲', 'zhe@example.com', 'WAL 模式的段落講得很清楚，已在自己的項目裏落地，謝謝分享。', 'approved')
    insComment.run(postId('build-modern-vue3-blog'), '過客', 'guest@example.com', '博主可以出一期評論系統的設計嗎？', 'pending')
  })

  seed()
  console.log(`[seed] database seeded at ${now()}`)
}
