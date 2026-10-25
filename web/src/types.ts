export interface PostItem {
  id: number
  title: string
  slug: string
  summary: string
  cover_image: string
  category_name: string | null
  category_slug: string | null
  status: string
  pinned: number
  views: number
  reading_minutes: number
  published_at: string | null
  created_at: string
  updated_at: string
  tags: Array<{ name: string; slug: string }>
}

export interface PostDetail extends PostItem {
  content: string
  prev: { title: string; slug: string } | null
  next: { title: string; slug: string } | null
}

export interface PageData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface Category {
  id: number
  name: string
  slug: string
  description: string
  post_count?: number
  /** 排序權重：越小越靠前（前台菜單與分類頁都按此排序） */
  sort_order?: number
}

export interface Tag {
  id: number
  name: string
  slug: string
  post_count?: number
  /** 首頁蜂巢 C 位標記（1 = C位） */
  is_center?: number
}

export interface Comment {
  id: number
  post_id?: number
  post_title?: string
  post_slug?: string
  nickname: string
  email?: string
  content: string
  status: string
  created_at: string
}

export interface GuestbookMessage {
  id: number
  nickname: string
  email?: string
  content: string
  status: string
  created_at: string
}

export interface FriendLink {
  id: number
  name: string
  url: string
  description: string
  sort_order?: number
  visible?: number
  created_at?: string
}

export interface SiteInfo {
  site_title: string
  site_subtitle: string
  about_content: string
  site_logo?: string
  /** 備案號文字，如「京ICP備2024012345號-1」 */
  icp_text?: string
  icp_url?: string
  /** '1' 顯示 / '0' 隱藏 */
  icp_visible?: string
  /** 網安備案文字，如「京公網安備11010502030123號」 */
  police_text?: string
  police_url?: string
  police_visible?: string
  /** 首頁大標題：豎線 | 包住部分漸變色，不加豎線則整句漸變色；留空使用預設 */
  hero_title?: string
  /** 首頁引導語（TypeWriter 前的固定文字），留空使用預設 */
  hero_intro?: string
  /** 首頁打字機詞組，以逗號分隔，留空使用預設 */
  hero_typed_words?: string
  /** 頁腳徽章文字，留空使用預設 */
  footer_badge?: string
  /** 頁腳版權整行，留空使用預設（© 年份 站名 · Powered by eooce） */
  footer_copyright?: string
  /** 頁腳標語，留空使用預設 */
  footer_note?: string
  /** 音樂播放器是否顯示：'1' 顯示 / '0' 隱藏 */
  music_visible?: string
  /** 音樂歌單 API 地址，留空使用預設 */
  music_list_url?: string
  /** YouTube 播放清單：每行一條「名稱 | 網址」，支援 watch / youtu.be / shorts 與 ?list= */
  music_youtube?: string
  /** 音樂播放器歌曲清單（歌單 API）是否顯示：'1' 顯示 / '0' 隱藏 */
  music_local_visible?: string
  /** 音樂播放器 YouTube 清單是否顯示：'1' 顯示 / '0' 隱藏 */
  music_youtube_visible?: string
}

export type NavMenuType = 'system' | 'group' | 'page' | 'link'

export interface PublicNavItem {
  id: number
  label: string
  type: NavMenuType
  to: string
  url: string
  open_new_tab: boolean
  children: PublicNavItem[]
}

export interface AdminMenuItem {
  id: number
  parent_id: number | null
  label: string
  type: NavMenuType
  system_path: string
  page_id: number | null
  url: string
  sort_order: number
  visible: number
  page_title: string | null
  page_slug: string | null
  page_content: string | null
}

export interface CustomPage {
  title: string
  content: string
  updated_at: string
}

export interface AdminStats {
  posts: { total: number; published: number; drafts: number }
  comments: { total: number; pending: number }
  views: number
  trend: {
    posts: Array<{ date: string; count: number }>
    comments: Array<{ date: string; count: number }>
  }
}

export interface AdminPostRow {
  id: number
  title: string
  slug: string
  summary: string
  status: string
  pinned: number
  views: number
  reading_minutes: number
  published_at: string | null
  created_at: string
  updated_at: string
  category_name: string | null
  category_id: number | null
  comment_count: number
}
