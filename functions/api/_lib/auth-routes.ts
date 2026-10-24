/** 認證路由：驗證碼與登入（與 Express 版 src/routes/auth.ts 一致） */
import { z } from 'zod'
import { route, type HandlerResult, type RouteCtx } from './router'
import { HttpError } from './http'
import { issueCaptcha, verifyCaptcha } from './captcha'
import { verifyPassword } from './password'
import { signToken, jwtSecret } from './jwt'
import { qFirst } from './db'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  captcha_id: z.string().min(1, '請填寫驗證碼'),
  captcha_code: z.string().min(1, '請填寫驗證碼'),
})

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
    const user = await qFirst<{ id: number; username: string; password_hash: string }>(
      ctx.env.DB,
      'SELECT * FROM users WHERE username = ?',
      username,
    )
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, '用戶名或密碼錯誤')
    }
    return {
      data: {
        token: await signToken({ uid: user.id, username: user.username }, jwtSecret(ctx.env)),
        username: user.username,
      },
    }
  })
}
