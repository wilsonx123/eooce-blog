/** 極簡路由器：與 Express 版 API 行為一致（/api 網關的分發核心） */
import { jsonFail, jsonOk, readJsonBody, toErrorResponse } from './http'
import { jwtSecret, verifyToken, type AuthPayload } from './jwt'
import { ensureSchema, seedIfEmpty, seedNavIfEmpty } from './seed'
import { registerAuthRoutes } from './auth-routes'
import { registerPublicRoutes } from './public-routes'
import { registerAdminRoutes } from './admin-routes'

export interface RouteCtx {
  request: Request
  url: URL
  env: Env
  /** URL 中的路徑參數（已 decodeURIComponent） */
  params: Record<string, string>
  auth?: AuthPayload
  /** 惰性解析 JSON 請求體（同一請求多次調用共享結果） */
  body: () => Promise<unknown>
}

export interface HandlerResult {
  data: unknown
  code?: number
}

export type RouteHandler = (ctx: RouteCtx) => Promise<Response | HandlerResult> | Response | HandlerResult

interface CompiledRoute {
  method: string
  regex: RegExp
  segNames: string[]
  handler: RouteHandler
}

const ROUTES: CompiledRoute[] = []

export function route(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  handler: RouteHandler,
): void {
  const segNames: string[] = []
  const regexStr = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        segNames.push(seg.slice(1))
        return '([^/]+)'
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  ROUTES.push({ method, regex: new RegExp('^' + regexStr + '$'), segNames, handler })
}

/** 初始化（建表 + 種子）每個 Worker 實例只觸發一次檢查；任一步失敗重置，下次請求自動重試 */
let initChecked = false
async function ensureInit(env: Env): Promise<void> {
  if (initChecked) return
  initChecked = true
  try {
    await ensureSchema(env.DB)
    await seedNavIfEmpty(env.DB)
    await seedIfEmpty(env.DB)
  } catch (error) {
    initChecked = false
    throw error
  }
}

async function dispatch(request: Request, env: Env, restPath: string): Promise<Response> {
  const method = request.method.toUpperCase()
  const matched = ROUTES.find((r) => r.method === method && r.regex.test(restPath))
  if (!matched) return jsonFail(404, '介面不存在')

  // 管理介面統一鑑權（與 Express 版 requireAuth 等價）
  let auth: AuthPayload | undefined
  if (restPath.startsWith('admin')) {
    const header = request.headers.get('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return jsonFail(401, '未登入或憑據缺失')
    auth = (await verifyToken(token, jwtSecret(env))) ?? undefined
    if (!auth) return jsonFail(401, '憑據無效或已過期，請重新登入')
  }

  const matches = restPath.match(matched.regex)!
  const params: Record<string, string> = {}
  matched.segNames.forEach((name, i) => {
    try {
      params[name] = decodeURIComponent(matches[i + 1])
    } catch {
      params[name] = matches[i + 1]
    }
  })

  let bodyPromise: Promise<unknown> | undefined
  const ctx: RouteCtx = {
    request,
    url: new URL(request.url),
    env,
    params,
    auth,
    body: () => {
      if (!bodyPromise) bodyPromise = readJsonBody(request)
      return bodyPromise
    },
  }

  const result = await matched.handler(ctx)
  if (result instanceof Response) return result
  return jsonOk(result.data, result.code ?? 200)
}

export async function handleApiRequest(request: Request, env: Env, restPath: string): Promise<Response> {
  try {
    await ensureInit(env)
    return await dispatch(request, env, restPath)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// 註冊路由（模塊加載即註冊）
registerAuthRoutes()
registerPublicRoutes()
registerAdminRoutes()
