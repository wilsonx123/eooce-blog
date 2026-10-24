<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { publicApi } from '@/api'
import type { CustomPage } from '@/types'
import { setRouteTitle } from '@/utils/title'
import MarkdownView from '@/components/MarkdownView.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const page = ref<CustomPage | null>(null)
const loading = ref(true)
const missing = ref(false)

async function load() {
  loading.value = true
  missing.value = false
  page.value = null
  try {
    page.value = await publicApi.page(route.params.slug as string)
    setRouteTitle(page.value.title)
  } catch {
    missing.value = true
  } finally {
    loading.value = false
  }
}

watch(() => route.params.slug, () => {
  if (route.name === 'custom-page') void load()
})

onMounted(load)
</script>

<template>
  <div class="container-page py-10">
    <div v-if="loading" class="card mx-auto h-64 max-w-3xl animate-pulse bg-slate-100 dark:bg-slate-800" />

    <template v-else-if="missing">
      <EmptyState title="頁面不存在" description="內容可能已被刪除或連結有誤">
        <router-link to="/" class="btn-primary">返回首頁</router-link>
      </EmptyState>
    </template>

    <div v-else-if="page" class="mx-auto max-w-3xl">
      <PageHeader :title="page.title" eyebrow="Page" />
      <div v-reveal class="card p-8 sm:p-10">
        <MarkdownView :content="page.content" />
      </div>
      <p v-reveal class="mt-4 text-right text-xs text-slate-400 dark:text-slate-500">
        最後更新於 {{ page.updated_at }}
      </p>
    </div>
  </div>
</template>
