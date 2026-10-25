import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { fail } from '../utils/response.js'

/**
 * JWT 簽名密鑰：生產環境必須在環境變數中配置 JWT_SECRET，缺失即拒絕啟動——
 * 嚴禁退回內置密鑰，否則任何人都可用公開的預設密鑰偽造管理員憑據。
 * （開發與測試環境允許使用內置密鑰，方便本地運行。）
 */
const JWT_SECRET =
  process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'blog-dev-secret-change-me')
if (!JWT_SECRET) {
  throw new Error('生產環境啟動必須設定 JWT_SECRET 環境變數（JWT 簽名密鑰缺失）')
}

export interface AuthPayload {
  uid: number
  username: string
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    fail(res, 401, '未登入或憑據缺失')
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload
    req.auth = payload
    next()
  } catch {
    fail(res, 401, '憑據無效或已過期，請重新登入')
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload
    }
  }
}
