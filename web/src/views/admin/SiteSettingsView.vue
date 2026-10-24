<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { adminApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()
const auth = useAuthStore()

/* ---------------- 網站資料 ---------------- */
const form = ref({
  site_title: '',
  site_subtitle: '',
  about_content: '',
  site_logo: '',
  hero_title: '',
  hero_intro: '',
  hero_typed_words: '',
  footer_badge: '',
  footer_copyright: '',
  footer_note: '',
  music_visible: true,
  music_local_visible: true,
  music_youtube_visible: true,
  music_list_url: '',
  music_youtube: '',
  icp_text: '',
  icp_url: '',
  icp_visible: true,
  police_text: '',
  police_url: '',
  police_visible: true,
})
const savingSite = ref(false)
const siteMessage = ref('')
const siteError = ref('')
const logoInput = ref<HTMLInputElement | null>(null)
const logoError = ref('')

async function loadSite() {
  site.loaded = false
  await site.fetch()
  form.value = {
    site_title: site.info.site_title,
    site_subtitle: site.info.site_subtitle,
    about_content: site.info.about_content,
    site_logo: site.info.site_logo ?? '',
    hero_title: site.info.hero_title ?? '',
    hero_intro: site.info.hero_intro ?? '',
    hero_typed_words: site.info.hero_typed_words ?? '',
    footer_badge: site.info.footer_badge ?? '',
    footer_copyright: site.info.footer_copyright ?? '',
    footer_note: site.info.footer_note ?? '',
    music_visible: site.info.music_visible !== '0',
    music_local_visible: site.info.music_local_visible !== '0',
    music_youtube_visible: site.info.music_youtube_visible !== '0',
    music_list_url: site.info.music_list_url ?? '',
    music_youtube: site.info.music_youtube ?? '',
    icp_text: site.info.icp_text ?? '',
    icp_url: site.info.icp_url ?? '',
    icp_visible: site.info.icp_visible !== '0',
    police_text: site.info.police_text ?? '',
    police_url: site.info.police_url ?? '',
    police_visible: site.info.police_visible !== '0',
  }
}

function pickLogo() {
  logoInput.value?.click()
}

function onLogoChange(e: Event) {
  logoError.value = ''
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    logoError.value = '請選擇圖片檔案'
    input.value = ''
    return
  }
  if (file.size > 400 * 1024) {
    logoError.value = '圖片不能超過 400KB，請壓縮後再上傳'
    input.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.value.site_logo = reader.result as string
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function resetLogo() {
  form.value.site_logo = ''
  logoError.value = ''
}

async function saveSite() {
  siteMessage.value = ''
  siteError.value = ''
  if (!form.value.site_title.trim()) {
    siteError.value = '網站標題不能為空'
    return
  }
  savingSite.value = true
  try {
    await adminApi.updateSite({ ...form.value })
    await site.reload()
    siteMessage.value = '網站資料已保存，前台重新整理後生效'
  } catch (e) {
    siteError.value = e instanceof Error ? e.message : '保存失敗，請重試'
  } finally {
    savingSite.value = false
  }
}

/* ---------------- 帳號安全 ---------------- */
const accountForm = ref({ current_password: '', username: '', new_password: '', confirm_password: '' })
const savingAccount = ref(false)
const accountMessage = ref('')
const accountError = ref('')

async function saveAccount() {
  accountMessage.value = ''
  accountError.value = ''
  if (!accountForm.value.current_password) {
    accountError.value = '請輸入當前密碼'
    return
  }
  if (!accountForm.value.username && !accountForm.value.new_password) {
    accountError.value = '用戶名和新密碼至少填寫一項'
    return
  }
  if (accountForm.value.new_password && accountForm.value.new_password !== accountForm.value.confirm_password) {
    accountError.value = '兩次輸入的新密碼不一致'
    return
  }
  savingAccount.value = true
  try {
    const res = await adminApi.updateAccount({
      current_password: accountForm.value.current_password,
      username: accountForm.value.username.trim() || undefined,
      new_password: accountForm.value.new_password || undefined,
    })
    auth.setSession(res.token, res.username)
    accountMessage.value = '帳號資料已更新'
    accountForm.value = { current_password: '', username: '', new_password: '', confirm_password: '' }
  } catch (e) {
    accountError.value = e instanceof Error ? e.message : '更新失敗，請重試'
  } finally {
    savingAccount.value = false
  }
}

onMounted(loadSite)
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <!-- 網站資料 -->
    <section class="card p-6 sm:p-8">
      <header class="mb-6">
        <h1 class="text-xl font-bold text-slate-900 dark:text-white">網站設定</h1>
        <p class="mt-1 text-sm text-slate-400">網站的名稱、副標題、Logo、首頁標語與關於頁內容</p>
      </header>

      <div class="space-y-5">
        <!-- Logo -->
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">網站 Logo</label>
          <div class="flex items-center gap-4">
            <img
              :src="form.site_logo || '/favicon.ico'"
              alt="logo 預覽"
              class="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-contain p-1 dark:border-slate-700 dark:bg-slate-900"
            />
            <div class="flex flex-col gap-2">
              <div class="flex gap-2">
                <button type="button" class="btn-outline !py-1.5 text-xs" @click="pickLogo">
                  {{ form.site_logo ? '更換圖片' : '上傳圖片' }}
                </button>
                <button
                  v-if="form.site_logo"
                  type="button"
                  class="btn-ghost !py-1.5 text-xs text-rose-500"
                  @click="resetLogo"
                >
                  恢復預設
                </button>
              </div>
              <p class="text-xs text-slate-400">支援 PNG / JPG / SVG / WebP，不超過 400KB</p>
              <p v-if="logoError" class="text-xs text-rose-500">{{ logoError }}</p>
            </div>
            <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoChange" />
          </div>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">網站標題 *</label>
            <input v-model="form.site_title" type="text" maxlength="60" class="input" placeholder="例如：老王Blog" />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">網站副標題</label>
            <input v-model="form.site_subtitle" type="text" maxlength="120" class="input" placeholder="一句話介紹你的網站" />
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">關於頁內容（Markdown）</label>
          <textarea
            v-model="form.about_content"
            rows="8"
            class="input resize-y font-mono text-[13px]"
            placeholder="支援 Markdown 語法，展示在「關於」頁面"
          />
        </div>

        <!-- 首頁標語與頁腳文字 -->
        <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">首頁標語與頁腳文字</h3>
          <p class="mt-1 text-xs text-slate-400">首頁大標題、引導語、打字機詞組，以及頁腳徽章、版權與標語；留空使用預設</p>

          <div class="mt-4 space-y-4">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">首頁大標題</label>
              <input
                v-model="form.hero_title"
                type="text"
                maxlength="120"
                class="input"
                placeholder="留空顯示預設：記錄 |代碼與文字的| 成長軌跡（豎線包住的部分顯示為漸變色）"
              />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">首頁引導語</label>
                <input
                  v-model="form.hero_intro"
                  type="text"
                  maxlength="60"
                  class="input"
                  placeholder="留空顯示預設：在這裏，我持續記錄"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">打字機詞組</label>
                <input
                  v-model="form.hero_typed_words"
                  type="text"
                  maxlength="200"
                  class="input"
                  placeholder="以逗號分隔：前端工程，後端架構，設計思考"
                />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">頁腳徽章</label>
                <input
                  v-model="form.footer_badge"
                  type="text"
                  maxlength="60"
                  class="input"
                  placeholder="留空顯示預設：記錄不息 · 筆耕不輟"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">頁腳版權（整行）</label>
                <input
                  v-model="form.footer_copyright"
                  type="text"
                  maxlength="120"
                  class="input"
                  placeholder="留空顯示預設：© 年份 站名 · Powered by eooce"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">頁腳標語</label>
                <input
                  v-model="form.footer_note"
                  type="text"
                  maxlength="120"
                  class="input"
                  placeholder="留空顯示預設：用 ♥ 編寫，與代碼一同成長"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 備案資料 -->
        <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">備案資料</h3>
          <p class="mt-1 text-xs text-slate-400">展示在頁腳底部中間，點擊以新標籤頁打開；關閉開關可單獨隱藏，文字留空同樣不顯示</p>

          <div class="mt-4 space-y-4">
            <div>
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-slate-500 dark:text-slate-400">ICP 備案</span>
                <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input v-model="form.icp_visible" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  顯示
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <input v-model="form.icp_text" type="text" maxlength="60" class="input" placeholder="備案號，如：京ICP備2024012345號-1" />
                <input v-model="form.icp_url" type="url" maxlength="300" class="input" placeholder="連結，如：https://beian.miit.gov.cn/" />
              </div>
            </div>

            <div>
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-slate-500 dark:text-slate-400">網安備案</span>
                <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input v-model="form.police_visible" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  顯示
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <input v-model="form.police_text" type="text" maxlength="60" class="input" placeholder="備案號，如：京公網安備11010502030123號" />
                <input v-model="form.police_url" type="url" maxlength="300" class="input" placeholder="連結，如：https://beian.mps.gov.cn/" />
              </div>
            </div>
          </div>
        </div>

        <!-- 音樂播放器 -->
        <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">音樂播放器</h3>
          <p class="mt-1 text-xs text-slate-400">控制頁首右上角的音樂播放器；關閉後前台不再顯示。下方兩個開關分別控制「歌曲清單（歌單 API）」與「YouTube 播放清單」區塊的顯示</p>

          <div class="mt-4 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">顯示播放器</span>
              <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input v-model="form.music_visible" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                顯示
              </label>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">歌曲清單（歌單 API）</span>
              <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input v-model="form.music_local_visible" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                顯示
              </label>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">YouTube 播放清單</span>
              <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input v-model="form.music_youtube_visible" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                顯示
              </label>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">歌單 API 地址</label>
              <input
                v-model="form.music_list_url"
                type="url"
                maxlength="300"
                class="input"
                placeholder="留空使用預設：https://music.eooce.com/api/music/list"
              />
              <p class="mt-1 text-xs text-slate-400">自訂地址需返回兼容的歌單 JSON：{"data":[{"filename":"歌名 - 歌手.mp3","url":"音頻檔地址"}]}</p>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">YouTube 播放清單</label>
              <textarea
                v-model="form.music_youtube"
                rows="3"
                class="input resize-y font-mono text-[13px]"
                placeholder="每行一條：名稱 | https://www.youtube.com/watch?v=xxxxxxxxxxx（名稱可省略，直接貼網址）"
              />
              <p class="mt-1 text-xs text-slate-400">支援 watch / youtu.be / shorts 與 ?list= 歌單連結；這些條目會置頂顯示在播放器清單，以內嵌 YouTube 播放器播出</p>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-4">
          <p v-if="siteMessage" class="text-sm text-emerald-600 dark:text-emerald-400">{{ siteMessage }}</p>
          <p v-else-if="siteError" class="text-sm text-rose-600 dark:text-rose-400">{{ siteError }}</p>
          <span v-else class="text-xs text-slate-400">保存後前台立即生效</span>
          <button type="button" class="btn-primary shrink-0" :disabled="savingSite" @click="saveSite">
            {{ savingSite ? '保存中...' : '保存網站資料' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 帳號安全 -->
    <section class="card p-6 sm:p-8">
      <header class="mb-6">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white">帳號安全</h2>
        <p class="mt-1 text-sm text-slate-400">修改管理員用戶名或密碼，需驗證當前密碼</p>
      </header>

      <div class="space-y-5">
        <div>
          <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">當前密碼 *</label>
          <input v-model="accountForm.current_password" type="password" class="input" placeholder="輸入當前密碼以驗證身份" autocomplete="current-password" />
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">新用戶名</label>
            <input v-model="accountForm.username" type="text" maxlength="30" class="input" :placeholder="`當前：${auth.username || '未設定'}`" autocomplete="username" />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">新密碼</label>
            <input v-model="accountForm.new_password" type="password" maxlength="64" class="input" placeholder="至少 6 位，留空則不修改" autocomplete="new-password" />
          </div>
        </div>
        <div v-if="accountForm.new_password">
          <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">確認新密碼 *</label>
          <input v-model="accountForm.confirm_password" type="password" maxlength="64" class="input" placeholder="再次輸入新密碼" autocomplete="new-password" />
        </div>

        <div class="flex items-center justify-between gap-4">
          <p v-if="accountMessage" class="text-sm text-emerald-600 dark:text-emerald-400">{{ accountMessage }}</p>
          <p v-else-if="accountError" class="text-sm text-rose-600 dark:text-rose-400">{{ accountError }}</p>
          <span v-else class="text-xs text-slate-400">修改用戶名後需使用新用戶名重新登入</span>
          <button type="button" class="btn-primary shrink-0" :disabled="savingAccount" @click="saveAccount">
            {{ savingAccount ? '更新中...' : '更新帳號資料' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
