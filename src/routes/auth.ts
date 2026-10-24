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
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    fail(res, 401, '用戶名或密碼錯誤')
    return
  }
  ok(res, { token: signToken({ uid: user.id, username: user.username }), username: user.username })
})

export default router
