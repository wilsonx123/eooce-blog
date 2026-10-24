<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import ScrollProgress from '@/components/ScrollProgress.vue'
import BackToTop from '@/components/BackToTop.vue'
import { useSiteStore } from '@/stores/site'

const route = useRoute()
const isBare = computed(() => route.meta.bare === true)
// 每次整頁加載拉取網站資料，保證任意路由下頁頭/頁腳標題正確
// 注意：瀏覽器標籤頁標題以 index.html 的 <title> 為準，不在此處覆蓋
const site = useSiteStore()
onMounted(() => site.fetch())
</script>

<template>
  <router-view v-if="isBare" />
  <div v-else class="flex min-h-screen flex-col">
    <ScrollProgress />
    <SiteHeader />
    <main class="flex-1">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <SiteFooter />
    <BackToTop />
  </div>
</template>
