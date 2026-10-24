import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'
import { useSiteStore } from '@/stores/site'
import { vReveal } from '@/directives/reveal'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.directive('reveal', vReveal)
// 掛載前同步初始化 site store：有本地快取時，啟動即以快取站名更換 index.html 佔位標題，避免閃現舊值
useSiteStore(pinia)
useThemeStore().apply()
app.mount('#app')
