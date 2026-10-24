/**
 * /api/* 的統一入口（Pages Functions catch-all 路由）。
 * 路徑參數 route 為 [[route]] 收集的剩餘段：/api/admin/posts/1 → route = ['admin','posts','1']
 */
import { handleApiRequest } from './_lib/router'

interface PagesFunctionCtx {
  request: Request
  env: Env
  params: { route?: string[] | string }
  waitUntil(promise: Promise<unknown>): void
}

export const onRequest = async (ctx: PagesFunctionCtx): Promise<Response> => {
  const raw = ctx.params.route
  const restPath = Array.isArray(raw) ? raw.join('/') : (raw ?? '')
  return handleApiRequest(ctx.request, ctx.env, restPath ?? '')
}
