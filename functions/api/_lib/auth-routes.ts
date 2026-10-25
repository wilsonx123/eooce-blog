/** 認證路由：驗證碼與登入（與 Express 版 src/routes/auth.ts 一致） */
import { z } from 'zod'
import { route, type HandlerResult, type RouteCtx } from './router'
import { HttpError } from './http'
import { issueCaptcha, verifyCaptcha } from './captcha'
import { verifyPassword } from './password'
import { signToken, jwtSecret } from './jwt'
import { qFirst, qRun } from './db'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  captcha_id: z.string().min(1, '請填寫驗證碼'),
  captcha_code: z.string().min(1, '請填寫驗證碼'),
})

/* 登入失敗限速（與 Express 版 src/routes/auth.ts 一致）：同一 IP 15 分鐘內錯 5 次即拒絕 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

/** 讀取訪問者 IP（Pages 邊緣節點注入；取不到時歸入 unknown 桶，限速依然生效） */
function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown'
}

/** 校驗視窗內失敗次數；順帶清理過期記錄。達上限拋 429 */
async function assertLoginAllowed(db: D1DatabaseLike, ip: string): Promise<void> {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS
  await qRun(db, 'DELETE FROM login_attempts WHERE created_at < ?', cutoff)
  const row = await qFirst<{ c: number }>(
    db,
    'SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND created_at >= ?',
    ip,
    cutoff,
  )
  if ((row?.c ?? 0) >= MAX_ATTEMPTS) {
    throw new HttpError(429, '登入失敗次數過多，請 15 分鐘後再試')
  }
}

export function registerAuthRoutes(): void {
  /** 獲取驗證碼（SVG 圖片，5 分鐘有效、一次性；儲存於 D1 以支援多實例） */
  route('GET', 'auth/captcha', async (ctx: RouteCtx): Promise<HandlerResult> => {
    return { data: await issueCaptcha(ctx.env.DB) }
  })

  route('POST', 'auth/login', async (ctx: RouteCtx): Promise<HandlerResult> => {
    const parsed = loginSchema.safeParse(await ctx.body())
    if (!parsed.success) {
      throw new HttpError(400, '請輸入用戶名、密碼與驗證碼')
    }
    const { username, password, captcha_id, captcha_code } = parsed.data
    if (!(await verifyCaptcha(ctx.env.DB, captcha_id, captcha_code))) {
      throw new HttpError(400, '驗證碼不正確或已過期')
    }
    const ip = clientIp(ctx.request)
    await assertLoginAllowed(ctx.env.DB, ip)
    const user = await qFirst<{ id: number; username: string; password_hash: string }>(
      ctx.env.DB,
      'SELECT * FROM users WHERE username = ?',
      username,
    )
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await qRun(ctx.env.DB, 'INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)', ip, Date.now())
      throw new HttpError(401, '用戶名或密碼錯誤')
    }
    // 登入成功：清除該 IP 的失敗記錄
    await qRun(ctx.env.DB, 'DELETE FROM login_attempts WHERE ip = ?', ip)
    return {
      data: {
        token: await signToken({ uid: user.id, username: user.username }, jwtSecret(ctx.env)),
        username: user.username,
      },
    }
  })
}
