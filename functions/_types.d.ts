/**
 * Cloudflare Pages Functions 環境的最小類型聲明（不依賴 @cloudflare/workers-types）。
 * DB 為 Pages 項目裏綁定的 D1 資料庫。
 */
interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>
}

interface D1DatabaseLike {
  prepare(sql: string): D1Statement
  batch<T = unknown>(statements: D1Statement[]): Promise<Array<{ results?: T[]; meta: { changes?: number; last_row_id?: number } }>>
}

interface Env {
  DB: D1DatabaseLike
  /** 用於簽名登入令牌（JWT）；生產環境必須在 Pages 設定中配置 */
  JWT_SECRET?: string
}
