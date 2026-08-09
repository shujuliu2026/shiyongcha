import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installUiTracking } from './composables/useAnalytics.js'
import './style.css'

installUiTracking()
createApp(App).use(router).mount('#app')
