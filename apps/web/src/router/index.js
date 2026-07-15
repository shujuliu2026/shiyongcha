import { createRouter, createWebHistory } from 'vue-router'
import { trackPageView, pushRecentTool } from '../composables/useAnalytics.js'

/** @param {string} title @param {string} [icon] */
function toolMeta (title, icon) {
  return { title, recent: icon ? { title, icon } : { title } }
}

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: '实用查' }
  },
  {
    path: '/history-today',
    name: 'history-today',
    component: () => import('../views/HistoryTodayView.vue'),
    meta: toolMeta('历史上的今天', '📜')
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { title: '运营后台', noTrack: true }
  },
  {
    path: '/feedback',
    name: 'feedback',
    component: () => import('../views/FeedbackView.vue'),
    meta: toolMeta('意见反馈', '💬')
  },
  {
    path: '/weather',
    name: 'weather',
    component: () => import('../views/WeatherView.vue'),
    meta: toolMeta('台风天气', '🌀')
  },
  {
    path: '/local-weather',
    name: 'local-weather',
    component: () => import('../views/LocalWeatherView.vue'),
    meta: toolMeta('临沂天气', '🌤️')
  },
  {
    path: '/hotlines',
    name: 'hotlines',
    component: () => import('../views/HotlinesView.vue'),
    meta: toolMeta('便民电话', '📞')
  },
  {
    path: '/districts',
    name: 'districts',
    component: () => import('../views/DistrictsView.vue'),
    meta: toolMeta('区划邮编', '📮')
  },
  {
    path: '/guides',
    name: 'guides',
    component: () => import('../views/GuidesView.vue'),
    meta: toolMeta('办事指南', '📋')
  },
  {
    path: '/official-nav',
    name: 'official-nav',
    component: () => import('../views/OfficialNavView.vue'),
    meta: toolMeta('官方信息查询', '🧭')
  },
  {
    path: '/id-region',
    name: 'id-region',
    component: () => import('../views/IdRegionView.vue'),
    meta: toolMeta('身份证归属', '🪪')
  },
  {
    path: '/aqi',
    name: 'aqi',
    component: () => import('../views/AqiView.vue'),
    meta: toolMeta('空气质量', '🌫️')
  },
  {
    path: '/precip',
    name: 'precip',
    component: () => import('../views/PrecipView.vue'),
    meta: toolMeta('降水量', '🌧️')
  },
  {
    path: '/oil',
    name: 'oil',
    component: () => import('../views/OilView.vue'),
    meta: toolMeta('油价速查', '⛽')
  },
  {
    path: '/price',
    name: 'price',
    component: () => import('../views/PriceView.vue'),
    meta: toolMeta('菜蛋肉价', '🥬')
  },
  {
    path: '/hospitals',
    name: 'hospitals',
    component: () => import('../views/HospitalsView.vue'),
    meta: toolMeta('医院速查', '🏥')
  },
  {
    path: '/transit',
    name: 'transit',
    component: () => import('../views/TransitView.vue'),
    meta: toolMeta('出行提示', '🚉')
  },
  {
    path: '/bus',
    name: 'bus',
    component: () => import('../views/BusView.vue'),
    meta: toolMeta('临沂公交', '🚌')
  },
  {
    path: '/bus-ic',
    name: 'bus-ic',
    component: () => import('../views/BusIcView.vue'),
    meta: toolMeta('公交IC卡网点', '💳')
  },
  {
    path: '/bus-shelters',
    name: 'bus-shelters',
    component: () => import('../views/BusShelterView.vue'),
    meta: toolMeta('公交站亭位置', '🚏')
  },
  {
    path: '/freight-stations',
    name: 'freight-stations',
    component: () => import('../views/FreightStationsView.vue'),
    meta: toolMeta('道路货运场站', '🚛')
  },
  {
    path: '/passenger-stations',
    name: 'passenger-stations',
    component: () => import('../views/PassengerStationsView.vue'),
    meta: toolMeta('道路客运场站', '🚍')
  },
  {
    path: '/driving-schools',
    name: 'driving-schools',
    component: () => import('../views/DrivingSchoolsView.vue'),
    meta: toolMeta('驾驶员培训机构', '🚗')
  },
  {
    path: '/social-regions',
    name: 'social-regions',
    component: () => import('../views/SocialRegionsView.vue'),
    meta: toolMeta('社保区划编码', '🏛️')
  },
  {
    path: '/ss-card',
    name: 'ss-card',
    component: () => import('../views/SsCardView.vue'),
    meta: toolMeta('社保卡制卡网点', '🪪')
  },
  {
    path: '/skill-subsidy',
    name: 'skill-subsidy',
    component: () => import('../views/SkillSubsidyView.vue'),
    meta: toolMeta('技能提升补贴经办', '📈')
  },
  {
    path: '/training-orgs',
    name: 'training-orgs',
    component: () => import('../views/TrainingOrgsView.vue'),
    meta: toolMeta('职业培训机构', '🎓')
  },
  {
    path: '/edu-bases',
    name: 'edu-bases',
    component: () => import('../views/EduBasesView.vue'),
    meta: toolMeta('继续教育基地', '📚')
  },
  {
    path: '/agri-prod',
    name: 'agri-prod',
    component: () => import('../views/AgriProdView.vue'),
    meta: toolMeta('分县区农业生产', '🌾')
  },
  {
    path: '/bank',
    name: 'bank',
    component: () => import('../views/BankView.vue'),
    meta: toolMeta('银行联行号', '🏦')
  },
  {
    path: '/bank/batch',
    name: 'bank-batch',
    component: () => import('../views/BankBatchView.vue'),
    meta: toolMeta('批量联行号', '📦')
  },
  {
    path: '/local-bank',
    name: 'local-bank',
    component: () => import('../views/BankView.vue'),
    props: { localMode: true },
    meta: toolMeta('临沂银行网点', '🏧')
  },
  {
    path: '/coord',
    name: 'coord',
    component: () => import('../views/CoordView.vue'),
    meta: toolMeta('坐标转换', '📐')
  },
  {
    path: '/holidays',
    name: 'holidays',
    component: () => import('../views/HolidaysView.vue'),
    meta: toolMeta('节假日', '📅')
  },
  {
    path: '/earthquake',
    name: 'earthquake',
    component: () => import('../views/EarthquakeView.vue'),
    meta: toolMeta('地震通报', '🏔️')
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('../views/AboutView.vue'),
    meta: { title: '关于', noTrack: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior () {
    return { top: 0 }
  }
})

router.afterEach((to) => {
  const t = to.meta?.title
  document.title = t ? `${t} · 实用查` : '实用查'
  if (to.meta?.noTrack) return

  const path = to.path || '/'
  trackPageView({ path, title: t || '实用查' })

  const recent = to.meta?.recent
  if (recent?.title && path !== '/') {
    pushRecentTool({
      to: path,
      title: recent.title,
      icon: recent.icon || '📌'
    })
  }
})

export default router
