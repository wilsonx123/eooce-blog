<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { publicApi } from '@/api'
import type { GuestbookMessage } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'

const messages = ref<GuestbookMessage[]>([])
const loading = ref(true)

const form = ref({ nickname: '', email: '', content: '' })
const submitting = ref(false)
const submitMessage = ref('')
const submitError = ref('')

async function load() {
  loading.value = true
  try {
    messages.value = await publicApi.guestbook()
  } finally {
    loading.value = false
  }
}

async function submit() {
  submitError.value = ''
  submitMessage.value = ''
  submitting.value = true
  try {
    await publicApi.addGuestbook({ ...form.value })
    submitMessage.value = '留言提交成功，審核通過後將會展示，感謝參與！'
    form.value = { nickname: '', email: '', content: '' }
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : '提交失敗，請重試'
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="container-page py-10">
    <PageHeader title="留言板" eyebrow="Guestbook" description="隨便聊聊，留下你的想法與建議，審核通過後會展示在這裏" />

    <!-- 左移量對齊標題「留言板」的第三個字（2 個字寬），隨標題字號在 sm 斷點變化 -->
    <div class="ml-[3.625rem] max-w-3xl sm:ml-[4.375rem]">
      <!-- 留言表單 -->
      <form v-reveal class="card space-y-4 p-6" @submit.prevent="submit">
        <div class="grid gap-4 sm:grid-cols-2">
          <input v-model="form.nickname" type="text" placeholder="暱稱 *" required maxlength="30" class="input" />
          <input v-model="form.email" type="email" placeholder="電郵 *（不會被展示）" required class="input" />
        </div>
        <textarea
          v-model="form.content"
          placeholder="想説的話... *"
          required
          rows="4"
          maxlength="1000"
          class="input resize-none"
        />
        <div class="flex items-center justify-between gap-4">
          <p v-if="submitMessage" class="text-sm text-emerald-600 dark:text-emerald-400">{{ submitMessage }}</p>
          <p v-else-if="submitError" class="text-sm text-rose-600 dark:text-rose-400">{{ submitError }}</p>
          <span v-else class="text-xs text-slate-400">留言將展示在審核通過後</span>
          <button type="submit" class="btn-primary shrink-0" :disabled="submitting">
            {{ submitting ? '提交中...' : '發表留言' }}
          </button>
        </div>
      </form>

      <!-- 留言列表 -->
      <div v-if="loading" class="mt-6 space-y-4">
        <div v-for="i in 3" :key="i" class="card h-24 animate-pulse bg-slate-100 dark:bg-slate-800" />
      </div>

      <div v-else-if="messages.length" class="mt-6 space-y-4">
        <div
          v-for="(message, i) in messages"
          :key="message.id"
          v-reveal="Math.min(i * 60, 300)"
          class="card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white shadow-soft transition-transform duration-300 hover:scale-110 hover:rotate-6"
            >
              {{ message.nickname.slice(0, 1) }}
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">{{ message.nickname }}</p>
              <p class="text-xs text-slate-400">{{ dayjs(message.created_at).format('YYYY-MM-DD HH:mm') }}</p>
            </div>
          </div>
          <p class="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {{ message.content }}
          </p>
        </div>
      </div>

      <EmptyState v-else class="mt-6" title="還沒有留言" description="來寫下第一條留言吧" />
    </div>
  </div>
</template>