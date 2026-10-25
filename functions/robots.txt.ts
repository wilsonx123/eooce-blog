/** robots.txt（Pages Functions 版，與 Express 版 src/routes/seo.ts 行為一致）：放開前台、隔開管理後台 */
export const onRequestGet = (ctx: { request: Request }): Response => {
  const origin = new URL(ctx.request.url).origin
  const body = ['User-agent: *', 'Disallow: /home', 'Disallow: /search', '', `Sitemap: ${origin}/sitemap.xml`, ''].join(
    '\n',
  )
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
