#!/usr/bin/env node
/**
 * 同步生产静态站到 wikimap web：
 *   dist → D:\projects\wikimap\apps\web\public\tools\shiyongcha\
 *
 * 用法（在 tool 根目录）：
 *   npm run sync:wikimap-web
 *
 * 构建时：
 *   VITE_BASE=/tools/shiyongcha/
 *   VITE_API_BASE=/tools/shiyongcha   → 请求 /tools/shiyongcha/api/v1/*
 *
 * 服务器还须：
 *   1) 本机跑 API :5180（或改 nginx upstream）
 *   2) 合并 nginx 片段 scripts/nginx-shiyongcha.conf
 *   3) 部署 wikimap apps/web（含 public 拷贝进 dist）
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB = path.join(ROOT, 'apps/web')
const DIST = path.join(WEB, 'dist')
const DEST = path.resolve(ROOT, '../wikimap/apps/web/public/tools/shiyongcha')
const BASE = '/tools/shiyongcha/'
const API_BASE = '/tools/shiyongcha'

function run (cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env }
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit_${code}`))))
  })
}

function rmrf (dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function copyDir (src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name)
    const d = path.join(dest, name)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

console.log(`[sync:wikimap-web] build base=${BASE} api=${API_BASE}`)
await run('npm', ['run', 'build', '--prefix', 'apps/web'], {
  VITE_BASE: BASE,
  VITE_API_BASE: API_BASE
})

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html missing')
  process.exit(1)
}

rmrf(DEST)
copyDir(DIST, DEST)
fs.writeFileSync(
  path.join(DEST, 'DEPLOY.txt'),
  `实用查静态同步
生成时间: ${new Date().toISOString()}
公网路径: https://www.linyilu.com/tools/shiyongcha/
API 反代: /tools/shiyongcha/api/ → 127.0.0.1:5180/api/
源仓: D:\\projects\\tool → github.com/shujuliu2026/shiyongcha
nginx: tool/scripts/nginx-shiyongcha.conf → 合并进 wikimap nginx-linyilu.conf
`,
  'utf8'
)

console.log(`[sync:wikimap-web] OK → ${DEST}`)
console.log('下一步：合并 nginx 片段、本机起 API:5180、部署 wikimap web dist')
