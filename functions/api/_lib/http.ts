/** 統一響應結構與 HTTP 錯誤（與 Express 版 src/utils/response.ts 保持一致） */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  // 網站標題/菜單等設定修改後必須立即生效，API 響應禁止瀏覽器快取
  'Cache-Control': 'no-store',
}

export function jsonOk(data: unknown, code = 200): Response {
  return new Response(JSON.stringify({ code, data, message: 'ok' }), { status: code, headers: JSON_HEADERS })
}

export function jsonFail(code: number, message: string): Response {
  return new Response(JSON.stringify({ code, data: null, message }), { status: code, headers: JSON_HEADERS })
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) return jsonFail(error.status, error.message)
  if (error instanceof SyntaxError) return jsonFail(400, '請求體格式錯誤')
  console.error('[api] error:', error)
  return jsonFail(500, '伺服器內部錯誤')
}

/** 讀取並解析 JSON 請求體；空請求體視為 undefined */
export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  const text = await request.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, '請求體格式錯誤')
  }
}
