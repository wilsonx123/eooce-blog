/**
 * 構造 LIKE 模糊匹配參數：轉義 LIKE 的通配符，避免用戶輸入的 % 和 _ 被當成通配符。
 * 需與 SQL 中的 ESCAPE '\' 成對使用。
 */
export function likePattern(input: string): string {
  const escaped = input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  return `%${escaped}%`
}