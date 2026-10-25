import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '../db/database.js'
import { signToken } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { issueCaptcha, verifyCaptcha } from '../utils/captcha.js'

const router = Router()

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  captcha_id: z.string().min(1, '請填寫驗證碼'),
  captcha_code: z.string().min(1, '請填寫驗證碼'),
})

/* 登入失敗限速（與 Pages Functions 版 functions/api/_lib/auth-routes.ts 一致）：同一 IP 15 分鐘內錯 5 次即拒絕 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

/** 讀取訪問者 IP（反向代理後取 X-Forwarded-For 首段） */
function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string {
  const fwd = String(req.headers['x-forwarded-for'] ?? '')
  return fwd.split(',')[0]?.trim() || req.ip || 'unknown'
}

/** 校驗視窗內失敗次數；順帶清理過期記錄。達上限返回 true */
function loginBlocked(ip: string): boolean {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS
  db.prepare('DELETE FROM login_attempts WHERE created_at < ?').run(cutoff)
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND created_at >= ?')
    .get(ip, cutoff) as { c: number }
  return row.c >= MAX_ATTEMPTS
}

/** 獲取驗證碼（SVG 圖片，5 分鐘有效、一次性；測試環境附帶明文供自動化斷言） */
router.get('/captcha', (_req, res) => {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
  ok(res, issueCaptcha(isTest))
})

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    fail(res, 400, '請輸入用戶名、密碼與驗證碼')
    return
  }
  const { username, password, captcha_id, captcha_code } = parsed.data
  if (!verifyCaptcha(captcha_id, captcha_code)) {
    fail(res, 400, '驗證碼不正確或已過期')
    return
  }
  const ip = clientIp(req)
  if (loginBlocked(ip)) {
    fail(res, 429, '登入失敗次數過多，請 15 分鐘後再試')
    return
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    db.prepare('INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)').run(ip, Date.now())
    fail(res, 401, '用戶名或密碼錯誤')
    return
  }
  // 登入成功：清除該 IP 的失敗記錄
  db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip)
  ok(res, { token: signToken({ uid: user.id, username: user.username }), username: user.username })
})

export default router
