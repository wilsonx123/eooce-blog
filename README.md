# LittleCLS

一個前後端分離的個人博客系統。前台簡潔大氣，支援深色模式、音樂播放器、自定義菜單與單頁；後台提供文章、分類、標籤、評論、自定義連結、菜單與網站設定的全功能管理。完全適配Mackdown格式，寫博客就想寫Mackdown一樣簡單。

介面全文為香港繁體中文（zh-HK），並採用香港慣用術語。

**技術棧**：

- 前端：Vue 3 + TypeScript + Vite + Tailwind CSS
- 後端 A（自建伺服器/VPS/Docker）：Express + better-sqlite3 (SQLite) + JWT
- 後端 B（Cloudflare Pages）：Pages Functions + D1 (SQLite) + Web Crypto JWT

## 功能特性

**前台**

- 文章列表（首篇特色卡片）、歸檔時間軸、分類/標籤聚合頁
- 文章詳情：目錄側邊欄、代碼高亮、代碼塊一鍵複製、閲讀進度條
- 全局：明暗主題切換（圓形擴散動畫）、滾動進入動畫、音樂播放器（在線歌單）
- 評論（審核通過後展示）、文章搜尋、自定義單頁、外鏈菜單（新標籤打開）

**後台**（`/home`，預設帳號 `admin / admin123`）

- 儀表盤（文章/評論/瀏覽量統計與 7 日趨勢）
- 文章管理（Markdown 編輯、置頂、發佈/草稿）、分類管理、標籤管理
- 評論管理（審核/刪除）
- 菜單管理：單頁 / 多頁分組 / 直接跳轉（新標籤打開）三種菜單類型，支援排序與顯隱
- 網站設定：網站標題、副標題、Logo 上傳、關於頁內容；修改管理員用戶名與密碼

## 項目結構

```
blog/
├── src/                # 後端源碼（Express API，自建伺服器/Docker 使用）
│   ├── routes/         # public / auth / admin 路由
│   ├── db/             # SQLite 初始化與種子數據
│   ├── middleware/     # JWT 認證
│   └── tests/          # API 測試（vitest）
├── functions/          # Cloudflare Pages Functions API（D1 版後端，行為與 Express 版一致）
│   ├── _types.d.ts     # 最小類型聲明（Env/D1）
│   └── api/
│       ├── [[route]].ts   # /api/* 統一入口
│       └── _lib/          # db / jwt / password / captcha / slug / seed / 路由
├── migrations/
│   └── schema.sql      # D1 表結構（Cloudflare Pages 使用）
├── data/               # SQLite 資料庫檔案（運行時生成，建議掛載卷）
├── web/                # 前端（Vue 3 + Vite）
│   ├── src/
│   ├── public/         # _redirects（SPA 回退）
│   └── dist/           # 前端構建產物（生產模式由後端託管）
├── wrangler.toml       # Cloudflare Pages + D1 綁定
├── scripts/            # 香港繁體轉換與檢查工具（一次性行為，冪等可重跑）
├── start.sh            # 一鍵啓動（後端 + 前端 dev）
└── Dockerfile
```

## 本地開發

要求 Node.js ≥ 22。

```bash
# 後端（根目錄）
npm install
npm run dev          # http://localhost:3001

# 前端（另開終端）
cd web
npm install
npm run dev          # http://localhost:5173，已代理 /api 到 3001
```

或使用一鍵腳本：`bash start.sh`

登入後台：`/home`，預設帳號 `admin / admin123`（登入後請在「網站設定 → 帳號安全」修改）。

### 本地模擬 Cloudflare Pages

```bash
npm run build        # 先構建前端到 web/dist
npm run cf:dev       # 等同於 npx wrangler pages dev，訪問 http://localhost:8788
```

`wrangler pages dev` 會同時掛載 `web/dist` 靜態頁面與 `functions/api` 的 D1 版 API（本地 D1 模擬），首次請求會自動建表前的種子資料（需先執行 `npx wrangler d1 execute blog-db --local --file=migrations/schema.sql` 建立 D1 表結構）。

## 測試

```bash
npm test             # 47 個 API 測試，使用獨立臨時資料庫
npm run typecheck:cf # 檢查 Cloudflare Functions 代碼的型別
```

## 生產部署（傳統方式）

> 注意：`npm run start` 只啓動後端。前端頁面需要先構建出 `web/dist`，後端檢測到後會自動託管整站（單端口：頁面 + API）。

```bash
npm run setup      # 首次：安裝前後端依賴
npm run build      # 構建前端到 web/dist
npm run start      # 啓動服務，預設 3001 端口，訪問 http://localhost:3001
```

後端會自動託管 `web/dist` 靜態資源並對前端路由做 SPA 回退（可用 `WEB_DIST` 環境變數指定產物路徑）。若啓動時看到「未檢測到前端構建產物」的警告，説明漏了 `npm run build`。

本地開發則不需要構建：`npm run dev`（後端）+ `cd web && npm run dev`（前端，熱更新）。

## Docker 部署

容器內不運行 Vite 開發伺服器：前端在構建階段編譯為靜態產物，由 Express 託管，**單端口對外提供整站**（API + 頁面）。預設端口 `3001`，與 `start.sh` 的端口約定保持一致。

```bash
# 運行docker並數據卷持久化SQLite資料庫
docker run -d \
  --name blog \
  -p 3001:3001 \
  -e JWT_SECRET="請替換為隨機長字串" \
  -v blog-data:/app/data \
  ghcr.io/eooce/blog:latest
```

訪問 `http://localhost:3001` 即為博客首頁，後台在 `/home`。

- 宿主機端口隨意映射，例如 `-p 80:3001`；容器內監聽端口可用 `-e PORT=xxxx` 覆蓋（記得同步調整 `-p`）

### 環境變數

| 變數 | 預設值 | 説明 |
| --- | --- | --- |
| `PORT` | `3001` | 容器內服務監聽端口 |
| `JWT_SECRET` | 內置開發密鑰 | 登入令牌簽名密鑰，**生產必須修改** |
| `BLOG_DB_PATH` | `/app/data/blog.db` | SQLite 資料庫檔案路徑 |
| `WEB_DIST` | `web/dist` | 前端構建產物目錄 |

### docker-compose 示例

```yaml
services:
  blog:
    image: ghcr.io/eooce/blog:latest
    ports:
      - "3001:3001"
    environment:
      JWT_SECRET: "請替換為隨機長字串"
    volumes:
      - blog-data:/app/data
    restart: unless-stopped

volumes:
  blog-data:
```

## 部署到 Cloudflare Pages

Cloudflare Pages 不支援 Node 原生模組與檔案系統，因此項目內置了一套專為 Pages/Workers 重寫的 API（`functions/`，Zero Node 依賴）：

| 項目 | Express 版（`src/`） | Pages Functions 版（`functions/`） |
| --- | --- | --- |
| 資料庫 | better-sqlite3（本機檔案） | Cloudflare D1（SQLite） |
| 密碼散列 | bcrypt | PBKDF2（Web Crypto，100k 迭代） |
| JWT | jsonwebtoken | 手寫 HMAC-SHA256（Web Crypto） |
| 驗證碼 | 進程內 Map | D1 `captchas` 表（多實例共享） |
| 事務 | SQLite transaction | `db.batch()`（原子） |

前端（`web/`）與 API 路由兩個版本完全一致，兩種部署方式可任選其一。部署在 Pages 時第一個請求會自動寫入種子資料（預設管理員 `admin / admin123`、示例文章等）。

### 方式一：GitHub/Push 集成（推薦）

1. 建立 D1 資料庫：`npx wrangler d1 create blog-db`，記下輸出的 `database_id`，填入 `wrangler.toml`
2. 初始化表結構（**可完全省略**：表結構與種子資料會在首次 API 請求時自動建立，
   僅有需要提前驗證 D1 連通性時才手動執行）：

   ```bash
   npx wrangler d1 execute blog-db --remote --file=migrations/schema.sql
   ```

3. 在 Cloudflare Dashboard 建立 Pages 專案（Connect to Git 選擇本倉庫）：
   - Build command：`npm install && npm run build`
   - Build output directory：`web/dist`

   > 頁面構建環境只會安裝根目錄依賴；`web/`（vue-tsc、vite 等）的依賴由項目內置的 `prebuild` 腳本自動補裝，無需在 Dashboard 額外設定。若缺少 web `package-lock.json`，構建仍可進行，但版本可能不一致。
4. 專案 Settings → Bindings 添加：
   - Type `D1 database` → Variable name `DB` → 選擇 `blog-db`
   - Type `Environment variables` → Variable name `JWT_SECRET` → 敏感值，填隨機長字串（**必須配置**，否則使用內置開發密鑰）
5. Deploy 完成後，Pages 自動識別 `functions/` 目錄作為 `/api/*` 的 Functions，`web/dist` 中的 `_redirects` 負責 SPA 回退。

### 方式二：Wrangler 直接部署

```bash
# 1. 建立 D1 資料庫（表結構與種子資料會在首次 API 請求時自動建立，無需手動建表）
npx wrangler d1 create blog-db
npx wrangler d1 execute blog-db --remote --file=migrations/schema.sql   # 可選，提前驗證連通性
# 把上一步輸出的 database_id 填入 wrangler.toml

# 2. 設定線上密鑰（也可部署後在 Dashboard 配置）
npx wrangler pages secret put JWT_SECRET

# 3. 構建前端並部署（會上傳 web/dist 與 functions/）
npm run cf:deploy      # 等同於 npm run build && npx wrangler pages deploy
```

首次部署會建立 `blog` Pages 專案；之後的重複部署只會更新資源。

### 部署後檢查

- 首頁 `https://<project>.pages.dev` 能看到示例文章
- 訪問 `https://<project>.pages.dev/api/site` 應返回 `{"code":200,...}`（種子資料在第一次訪問時自動寫入）
- 後台在 `/home`，用 `admin / admin123` 登入後立即改密碼
- 自定義域名：Pages 專案 Settings → Custom domains

### 注意事項

- `web/dist/_redirects` 提供 SPA 回退（`/* /index.html 200`）；`/api/*` 由 Functions 優先處理，不會被改寫。
- 若 migrated 遷移舊 Express 資料庫的內容到 D1，管理員密碼欄位是 bcrypt 格式，需在後台重新設定密碼（登入需驗證碼配合，可先用管理介面重設），或以 PBKDF2 格式生成 `password_hash`。
- Pages 免費計劃的每次請求 CPU 時間有限制；PBKDF2（100k 迭代）只出現在登入/改密碼介面，正常瀏覽請求不受影響。

## API 概覽

| 分組 | 説明 |
| --- | --- |
| `GET /api/site` `GET /api/nav` `GET /api/pages/:slug` | 網站資料、導航菜單、自定義單頁 |
| `GET /api/posts` `GET /api/posts/:slug` `GET /api/archives` | 文章列表/詳情/歸檔，支援分類、標籤、搜尋參數 |
| `GET /api/categories` `GET /api/tags` | 分類與標籤（含文章計數） |
| `POST /api/auth/login` | 登入，返回 JWT |
| `POST /api/posts/:slug/comments` | 提交評論（待審核） |
| `/api/admin/*` | 管理介面：文章/分類/標籤/評論/菜單/網站設定/帳號，需 `Authorization: Bearer <token>` |

響應統一為 `{ code, data, message }` 結構；錯誤語義：400 參數、401 未登入、404 不存在、409 衝突。以上介面在 Express 版與 Cloudflare Pages Functions 版中行為一致。
