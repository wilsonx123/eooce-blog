/**
 * 構造 LIKE 模糊匹配參數：轉義 LIKE 的通配符，避免用戶輸入的 % 和 _ 被當成通配符。
 * 需與 SQL 中的 ESCAPE '\' 成對使用。
 */
export function likePattern(input: string): string {
  const escaped = input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  return `%${escaped}%`
}

/** 估算閲讀時長（與 Express 版 src/db/database.ts 一致） */
export function estimateReadingMinutes(content: string): number {
  const cjkCount = (content.match(/[\u4e00-\u9fff]/g) ?? []).length
  const wordCount = content
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round((cjkCount / 400 + wordCount / 200) || 1))
}

/** 資料庫時間戳格式（與 SQLite datetime('now') 一致） */
export function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}
