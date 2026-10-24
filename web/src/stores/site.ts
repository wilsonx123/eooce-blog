import { defineStore } from 'pinia'
import { publicApi } from '@/api'
import type { SiteInfo } from '@/types'
import { setBaseTitle } from '@/utils/title'

const CACHE_KEY = 'blog_site_cache'

// 預設值為空：網站資料未加載完成前不顯示任何佔位文字，避免重新整理時閃爍錯誤標題
const DEFAULT_SITE: SiteInfo = {
  site_title: '',
  site_subtitle: '',
  about_content: '',
  hero_title: '',
  hero_intro: '',
  hero_typed_words: '',
  footer_badge: '',
  footer_copyright: '',
  footer_note: '',
  music_visible: '',
  music_list_url: '',
  music_youtube: '',
  music_local_visible: '',
  music_youtube_visible: '',
}

/** 讀取上次成功獲取的網站資料，重新整理時首屏即可顯示正確內容 */
function cachedSite(): SiteInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SiteInfo
    return parsed && typeof parsed.site_title === 'string' ? parsed : null
  } catch {
    return null
  }
}

export const useSiteStore = defineStore('site', {
  state: () => ({
    info: (cachedSite() ?? { ...DEFAULT_SITE }) as SiteInfo,
    loaded: false,
  }),
  actions: {
    async fetch(retries = 2): Promise<void> {
      if (this.loaded) return
      try {
        const info = await publicApi.site()
        this.info = { ...DEFAULT_SITE, ...info }
        this.loaded = true
        // 站名與副標題即時同步到瀏覽器標籤頁（與 Express 模式的伺服器端注入行為一致）
        setBaseTitle(this.info.site_title)
        if (this.info.site_subtitle) {
          document.querySelector('meta[name="description"]')?.setAttribute('content', this.info.site_subtitle)
        }
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(this.info))
        } catch {
          /* 儲存不可用時忽略 */
        }
      } catch {
        // 瞬態失敗（如代理重連）時短暫等待後重試，避免長時間顯示預設標題
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 800))
          return this.fetch(retries - 1)
        }
      }
    },
    /** 強制重新拉取（後台保存網站設定後調用） */
    async reload() {
      this.loaded = false
      await this.fetch()
    },
  },
})