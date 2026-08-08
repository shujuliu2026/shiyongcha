#!/usr/bin/env node
/**
 * 带留痕的数据更新：先快照原文 → 执行命令 → 对比明细写日志
 *
 * 用法：
 *   npm run refresh:record -- --source hukou-windows-json -- npm run import:hukou
 *   npm run refresh:record -- --source ss-card-outlets-json --note "补电话" -- npm run writeback:ss-card -- --phones
 *   npm run refresh:record -- --source ss-card-outlets-json --file data/local/linyi/ss-card-outlets.json -- echo noop
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { beginDataRefresh, finishDataRefresh } from '../packages/shared/data-refresh-log.mjs'
import { DEFAULT_DATA_SOURCES } from '../packages/shared/data-sources.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs (argv) {
  /** @type {Record<string, string|boolean>} */
  const opts = {}
  /** @type {string[]} */
  const cmd = []
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a === '--') {
      cmd.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        opts[key] = next
        i += 2
      } else {
        opts[key] = true
        i += 1
      }
      continue
    }
    i += 1
  }
  return { opts, cmd }
}

const { opts, cmd } = parseArgs(process.argv.slice(2))
const sourceId = String(opts.source || opts.s || '').trim()
if (!sourceId || !cmd.length) {
  console.error(`用法: node scripts/record-data-refresh.mjs --source <sourceId> [--note ...] -- <命令...>

已登记本地源示例：
${DEFAULT_DATA_SOURCES.filter((s) => s.file_path && String(s.file_path).endsWith('.json'))
  .slice(0, 12)
  .map((s) => `  ${s.id}  →  ${s.file_path}`)
  .join('\n')}`)
  process.exit(1)
}

const filePath = opts.file ? String(opts.file) : undefined
const note = opts.note ? String(opts.note) : ''
const began = beginDataRefresh({
  sourceId,
  filePath,
  trigger: 'cli',
  note
})
console.log(`[refresh] snapshot ${began.snapshot_path} · run ${began.run_id}`)

function runCommand (parts) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = parts
    const child = spawn(bin, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`command_exit_${code}`))
    })
  })
}

try {
  await runCommand(cmd)
  const rec = finishDataRefresh({
    runId: began.run_id,
    sourceId,
    filePath: began.file_path,
    note,
    touch: true
  })
  const s = rec.summary || {}
  console.log(
    `[refresh] ${rec.status} · +${s.added || 0}/-${s.removed || 0}/~${s.changed || 0} · changes ${rec.changes_total} → ${rec.changes_path}`
  )
} catch (e) {
  const rec = finishDataRefresh({
    runId: began.run_id,
    sourceId,
    filePath: began.file_path,
    status: 'error',
    note,
    error: e?.message || String(e),
    touch: false
  })
  console.error(`[refresh] FAILED · run ${rec.run_id} · ${e?.message || e}`)
  process.exit(1)
}
