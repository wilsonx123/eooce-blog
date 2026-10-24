<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { publicApi } from '@/api'
import type { PostItem } from '@/types'
import PostCard from '@/components/PostCard.vue'
import Pagination from '@/components/Pagination.vue'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'
import { setRouteTitle } from '@/utils/title'

const props = defineProps<{ kind: 'category' | 'tag' }>()
const route = useRoute()
const posts = ref<PostItem[]>([])
const total = ref(0)
const title = ref('')
const loading = ref(true)
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

async function load() {
  loading.value = true
  const slug = route.params.slug as string
  try {
    const data =
      props.kind === 'category'
        ? await publicApi.posts({ page: page.value, pageSize: 9, category: slug })
        : await publicApi.posts({ page: page.value, pageSize: 9, tag: slug })
    posts.value = data.list
    total.value = data.total

    // 解析顯示名稱（分類名/標籤名），介面異常時回退到 slug
    try {
      if (props.kind === 'category') {
        const cats = await publicApi.categories()
        title.value = cats.find((c) => c.slug === slug)?.name ?? decodeURIComponent(slug)
      } else {
        const tags = await publicApi.tags()
        title.value = tags.find((t) => t.slug === slug)?.name ?? decodeURIComponent(slug)
      }
    } catch {
      title.value = decodeURIComponent(slug)
    }
    // 標籤頁標題：站名-分類/標籤名稱（站名隨網站設定動態更新）
    setRouteTitle(title.value)
  } finally {
    loading.value = false
  }
}

watch(() => [route.params.slug, page.value], load)
onMounted(load)
</script>

<template>
  <div class="container-page py-10">
    <PageHeader :eyebrow="kind === 'category' ? 'Category' : 'Tag'" :title="`${kind === 'category' ? '' : '#'} ${title}`">
      <template #description>
        共 <span class="font-semibold text-brand-500">{{ total }}</span> 篇文章
      </template>
    </PageHeader>

    <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800" />
    </div>

    <template v-else-if="posts.length">
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="(post, i) in posts" :key="post.id" v-reveal="Math.min(i * 70, 420)">
          <PostCard :post="post" />
        </div>
      </div>
      <div v-reveal class="mt-10">
        <Pagination :page="page" :page-size="9" :total="total" @change="(p) => $router.push({ query: { page: p } })" />
      </div>
    </template>

    <EmptyState v-else title="該分類下暫無文章" />
  </div>
</template>
