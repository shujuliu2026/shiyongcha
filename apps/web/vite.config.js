import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const apiTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5180').trim()
  // 生产挂到临忆录：VITE_BASE=/tools/shiyongcha/ · 本地开发保持 /
  const base = (env.VITE_BASE || '/').trim() || '/'

  return {
    base,
    plugins: [vue()],
    define: {
      __APP_BUILD__: JSON.stringify(
        new Date().toISOString().slice(0, 16).replace('T', ' ')
      )
    },
    server: {
      port: 5176,
      host: true,
      proxy: {
        '/api/v1': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 4176,
      host: true
    }
  }
})
