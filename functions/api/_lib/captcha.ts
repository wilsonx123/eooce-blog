/**
 * SVG 驗證碼：5 分鐘有效、一次性。
 * 與 Express 版的內存 Map 不同，D1 可跨實例共享，避免登入請求落到另一個實例時校驗失敗。
 */
import { qFirst, qRun, qBatch, stmt } from './db'

const TTL_SECONDS = 5 * 60

// 排除易混淆字元（0/O、1/I/L 等）
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const COLORS = ['#185a56', '#fd742d', '#0f766e', '#b45309', '#475569']

export interface IssuedCaptcha {
  id: string
  svg: string
}

function randomCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)]
  return code
}

function renderSvg(code: string): string {
  const width = 120
  const height = 44
  let glyphs = ''
  for (let i = 0; i < code.length; i++) {
    const x = 16 + i * 24 + (Math.random() * 6 - 3)
    const y = 31 + (Math.random() * 6 - 3)
    const rot = (Math.random() * 36 - 18).toFixed(1)
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    glyphs += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${color}" font-size="26" font-weight="700" font-family="monospace" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${code[i]}</text>`
  }
  let noise = ''
  for (let i = 0; i < 3; i++) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    noise += `<line x1="${(Math.random() * width).toFixed(0)}" y1="${(Math.random() * height).toFixed(0)}" x2="${(Math.random() * width).toFixed(0)}" y2="${(Math.random() * height).toFixed(0)}" stroke="${color}" stroke-width="1" opacity="0.45"/>`
  }
  for (let i = 0; i < 8; i++) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    noise += `<circle cx="${(Math.random() * width).toFixed(0)}" cy="${(Math.random() * height).toFixed(0)}" r="1.2" fill="${color}" opacity="0.4"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="驗證碼"><rect width="100%" height="100%" rx="8" fill="#f1f5f9"/>${noise}${glyphs}</svg>`
}

export async function issueCaptcha(db: D1DatabaseLike): Promise<IssuedCaptcha> {
  const code = randomCode()
  const id = crypto.randomUUID()
  const nowSeconds = Math.floor(Date.now() / 1000)
  // 原子打包：清理過期驗證碼 + 寫入新驗證碼
  await qBatch(db, [
    { sql: 'DELETE FROM captchas WHERE expires < ?', params: [nowSeconds] },
    { sql: 'INSERT INTO captchas (id, code, expires) VALUES (?, ?, ?)', params: [id, code.toLowerCase(), nowSeconds + TTL_SECONDS] },
  ])
  return { id, svg: renderSvg(code) }
}

/** 校驗並消費驗證碼（一次性，無論成敗都刪除記錄） */
export async function verifyCaptcha(db: D1DatabaseLike, id: string, code: string): Promise<boolean> {
  const row = await qFirst<{ code: string }>(db, 'SELECT code FROM captchas WHERE id = ?', id)
  await qRun(db, 'DELETE FROM captchas WHERE id = ?', id)
  if (!row || typeof row.code !== 'string') return false
  return row.code === code.trim().toLowerCase()
}

// stmt 供 batch 內清理語句複用（顯式導出以便 tree-shaking 保持簡單）
export { stmt }
