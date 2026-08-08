#!/usr/bin/env node
/** CLI：同步生成本地 JSON 留痕基线 · npm run refresh:sync */
import { syncGenerateLocalSources } from '../packages/shared/data-refresh-log.mjs'

const note = process.argv.includes('--note')
  ? process.argv[process.argv.indexOf('--note') + 1]
  : '同步生成基线'

const result = syncGenerateLocalSources({ note })
console.log(`[refresh:sync] ${result.ok}/${result.count} ok · error ${result.error}`)
for (const it of result.items) {
  const s = it.summary
  console.log(
    `  ${it.status} ${it.source_id}` +
      (s ? ` · +${s.added}/-${s.removed}/~${s.changed}` : '') +
      (it.error ? ` · ${it.error}` : '')
  )
}
process.exit(result.error ? 1 : 0)
