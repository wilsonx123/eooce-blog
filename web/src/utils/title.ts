/**
 * 標籤頁標題的統一管理。
 *
 * index.html 中的 <title> 只是初始佔位：網站設定（site_title）加載完成後，
 * site store 會調用 setBaseTitle() 更新基準站名，後台改站名後標籤頁標題亦隨之生效。
 * 路由切換由 router afterEach 調用 setRouteTitle()，非首頁顯示「站名-頁面標題」。
 */

/** 站名基準（初始為 index.html 佔位值，網站設定加載後動態更新） */
let baseTitle = document.title

/** 當前路由的明確頁面標題，為空表示僅顯示站名（首頁） */
let routeTitle = ''

function applyTitle(): void {
  document.title = routeTitle ? `${baseTitle}-${routeTitle}` : baseTitle
}

/** 網站設定的站名加載或修改後，更新標籤頁基準標題 */
export function setBaseTitle(title: string): void {
  const next = title.trim()
  if (!next) return
  baseTitle = next
  applyTitle()
}

/** 路由切換後設定頁面標題（undefined 或空串表示僅顯示站名） */
export function setRouteTitle(title: string | undefined): void {
  routeTitle = (title ?? '').trim()
  applyTitle()
}
