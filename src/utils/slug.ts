import { pinyin } from 'pinyin-pro'
import { HttpError } from './response.js'

export function slugify(title: string): string {
  // 中文名稱轉寫為拼音，保證自動生成的 slug 為英文（如「前端開發」→ qian-duan-kai-fa）
  const transliterated = pinyin(title, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('-')
  const base = transliterated
    .toLowerCase()
    .trim()
    // 剝離變音符號（拼音 ü → u），保持 URL 友好
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return base || 'post'
}

export function randomSuffix(len = 4): string {
  return Math.random().toString(36).slice(2, 2 + len)
}

/** 自動生成的路徑最長長度（超出時在詞邊界截斷），避免 URL 過長 */
const AUTO_SLUG_MAX = 48

/**
 * 文章路徑的自動生成規則（未手動填寫 slug 時）：
 * - 英文/數字開頭：取開頭的英文片段（遇到中文等字元即止），如「AWS大放水？…」→ aws
 * - 中文開頭：取前兩個字的拼音，如「註冊最重要的環境…」→ zhu-ce
 */
export function autoSlug(title: string): string {
  const trimmed = title.trim()

  const leading = trimmed.match(/^[A-Za-z0-9][A-Za-z0-9\s._-]*/)
  if (leading) {
    const base = slugify(leading[0])
    if (base) {
      return base.length > AUTO_SLUG_MAX ? base.slice(0, AUTO_SLUG_MAX).replace(/-[^-]*$/, '') : base
    }
  }

  // 去掉開頭的標點/空白後再取前兩個字，避免「《前端》…」取到書名號
  const stripped = trimmed.replace(/^[\s\p{P}\p{S}]+/u, '')
  const firstTwo = Array.from(stripped).slice(0, 2).join('')
  return slugify(firstTwo || trimmed)
}

const RESERVED_SLUGS = new Set(['admin', 'api', 'assets', 'static', 'favicon.ico'])

export function assertValidSlug(slug: string): void {
  if (RESERVED_SLUGS.has(slug)) {
    throw new HttpError(409, '該 slug 為系統保留名稱')
  }
}
