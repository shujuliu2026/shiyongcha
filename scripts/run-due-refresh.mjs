#!/usr/bin/env node
/**
 * 按约定检查到期数据源并执行更新（供任务计划每小时调用）
 *
 *   npm run refresh:due
 *   npm run refresh:due -- --dry
 *   npm run refresh:due -- --force   # 忽略间隔，全量跑约定表
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { listRefreshSchedule } from '../packages/shared/data-refresh-log.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')
const force = process.argv.includes('--force')

const { items, convention } = listRefreshSchedule()
console.log(`[refresh:due] ${convention}`)

const due = items.filter((it) => force || it.due)
if (!due.length) {
  console.log('[refresh:due] 无到期任务')
  process.exit(0)
}

function run (parts) {
  return new Promise((resolve, reject) => {
    const child = spawn(parts[0], parts.slice(1), {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit_${code}`))))
  })
}

let fail = 0
for (const job of due) {
  const script = String(job.npm_script || '').trim()
  if (!script) {
    console.warn('[skip] no npm_script', job.source_id)
    continue
  }
  console.log(`[due] ${job.source_id} · npm run ${script}${dry ? ' (dry)' : ''}`)
  if (dry) continue
  try {
    await run([
      'npm',
      'run',
      'refresh:record',
      '--',
      '--source',
      job.source_id,
      '--note',
      `定时 ${job.cron_hint || ''}`.trim(),
      '--',
      'npm',
      'run',
      script
    ])
  } catch (e) {
    fail++
    console.error('[fail]', job.source_id, e?.message || e)
  }
}

process.exit(fail ? 1 : 0)
