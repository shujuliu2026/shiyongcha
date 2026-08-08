/**
 * 生产包预览：静态 dist + 反代 /api/v1 → API
 * 避免 Vite/esbuild 在内存紧张时起不来
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'apps/web/dist')
const API = (process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5180').replace(/\/$/, '')
const PORT = Number(process.env.PREVIEW_PORT || 5176)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
}

const ASSET_EXT = new Set(Object.keys(MIME).filter((e) => e !== '.html'))

function sendFile (res, filePath, extraHeaders = {}) {
  const ext = path.extname(filePath)
  const type = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type, ...extraHeaders })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  if (url.pathname.startsWith('/api/v1') || url.pathname === '/health') {
    try {
      const headers = {}
      const pass = ['content-type', 'x-admin-token', 'x-license-token', 'accept']
      for (const k of pass) {
        const v = req.headers[k]
        if (v) headers[k] = Array.isArray(v) ? v[0] : v
      }
      /** @type {Buffer|undefined} */
      let payload
      if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
        const chunks = []
        for await (const c of req) chunks.push(c)
        payload = Buffer.concat(chunks)
      }
      const upstream = await fetch(`${API}${url.pathname}${url.search}`, {
        method: req.method || 'GET',
        headers,
        body: payload && payload.length ? payload : undefined
      })
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json'
      })
      res.end(buf)
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'api_proxy_failed', message: e?.message || String(e) }))
    }
    return
  }

  let rel = url.pathname === '/' ? '/index.html' : url.pathname
  let filePath = path.join(DIST, rel)
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    return res.end('forbidden')
  }

  const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  if (!exists) {
    const ext = path.extname(url.pathname).toLowerCase()
    // Hashed assets / static files must 404 — never SPA-fallback HTML as JS/CSS
    // (stale tab after rebuild → "Failed to fetch dynamically imported module")
    if (ASSET_EXT.has(ext) || url.pathname.startsWith('/assets/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('not found')
    }
    filePath = path.join(DIST, 'index.html')
  }

  const isIndex = path.basename(filePath) === 'index.html'
  sendFile(
    res,
    filePath,
    isIndex
      ? { 'Cache-Control': 'no-cache' }
      : { 'Cache-Control': 'public, max-age=31536000, immutable' }
  )
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview] http://127.0.0.1:${PORT} → dist + ${API}`)
})
