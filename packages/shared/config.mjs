/**
 * 实用查 · 全局配置（默认本地城市）
 */
export const APP_CONFIG = Object.freeze({
  brand: '实用查',
  defaultCity: {
    id: 'linyi',
    name: '临沂',
    lat: 35.104,
    lng: 118.356,
    alertKm: 200,
    province: '山东'
  }
})

export const DEFAULT_WATCH = Object.freeze({
  lat: APP_CONFIG.defaultCity.lat,
  lng: APP_CONFIG.defaultCity.lng,
  label: APP_CONFIG.defaultCity.name,
  alertKm: APP_CONFIG.defaultCity.alertKm
})
