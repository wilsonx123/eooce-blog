import { defineStore } from 'pinia'
import { publicApi } from '@/api'
import type { PublicNavItem } from '@/types'

export const DEFAULT_NAV: PublicNavItem[] = [
  { id: -1, label: '首頁', type: 'system', to: '/', url: '', open_new_tab: false, children: [] },
  { id: -2, label: '分類', type: 'system', to: '/categories', url: '', open_new_tab: false, children: [] },
  { id: -3, label: '標籤', type: 'system', to: '/tags', url: '', open_new_tab: false, children: [] },
  { id: -4, label: '歸檔', type: 'system', to: '/archives', url: '', open_new_tab: false, children: [] },
  { id: -5, label: '關於', type: 'system', to: '/about', url: '', open_new_tab: false, children: [] },
  { id: -6, label: '留言板', type: 'system', to: '/guestbook', url: '', open_new_tab: false, children: [] },
]

export const useNavStore = defineStore('nav', {
  state: () => ({
    tree: DEFAULT_NAV.map((n) => ({ ...n })) as PublicNavItem[],
    loaded: false,
  }),
  actions: {
    async fetch(retries = 2): Promise<void> {
      if (this.loaded) return
      try {
        const tree = await publicApi.nav()
        if (Array.isArray(tree) && tree.length) {
          this.tree = tree
          this.loaded = true
        }
      } catch {
        // 瞬態失敗時短暫等待後重試
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 800))
          return this.fetch(retries - 1)
        }
      }
    },
    /** 後台修改菜單後強制重新整理 */
    async reload() {
      this.loaded = false
      await this.fetch()
    },
  },
})
