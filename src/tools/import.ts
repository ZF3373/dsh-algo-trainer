import type { PlatformId, Verdict } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'

const VERDICTS: readonly Verdict[] = ['AC', 'WA', 'TLE', 'RE', 'MLE', 'CE', 'SKIPPED']

interface ManualRow {
  problemKey: string
  title?: string
  verdict?: string
  difficulty?: number
  tags?: string[]
  url?: string
  submittedAt?: string
  language?: string
  externalId?: string
}

export function registerImportTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_import',
    description:
      '手动导入刷题记录（JSON 数组）。每行含 problemKey/title/verdict/difficulty/tags/url/submittedAt。' +
      '按 externalId 去重；缺省 externalId 为 manual:<platform>:<problemKey>:<verdict>。',
    parameters: {
      platform: { type: 'string', required: true, enum: ['codeforces', 'atcoder'] },
      rows: { type: 'array', items: { type: 'object' }, description: 'JSON 行数组' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const platform = args.platform as PlatformId
      if (!['codeforces', 'atcoder'].includes(platform))
        return { ok: false, error: `platform 非法` }
      if (!Array.isArray(args.rows))
        return { ok: false, error: 'rows 必须是数组' }

      const subs = (args.rows as unknown[]).map((row, i) => {
        const r = row as ManualRow
        const problemKey = String(r.problemKey ?? '').trim()
        if (!problemKey) throw new Error(`第 ${i + 1} 行缺少 problemKey`)
        const verdictRaw = String(r.verdict ?? 'SKIPPED').trim().toUpperCase()
        if (!(VERDICTS as readonly string[]).includes(verdictRaw))
          throw new Error(`第 ${i + 1} 行 verdict 非法: ${r.verdict}`)
        const tags = Array.isArray(r.tags) ? r.tags.map(String).filter(Boolean) : []
        const externalId = r.externalId ?? `manual:${platform}:${problemKey}:${verdictRaw}`
        return {
          platform,
          problemKey,
          verdict: verdictRaw as Verdict,
          language: r.language?.trim() || undefined,
          submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : new Date().toISOString(),
          externalId,
        }
      })

      // upsert problems
      for (const s of subs) {
        const existing = host.store.findProblem(s.platform, s.problemKey)
        if (!existing) {
          host.store.upsertProblem({
            platform: s.platform,
            problemKey: s.problemKey,
            title: s.problemKey,
            difficulty: null,
            url: null,
            tags: [],
          })
        }
      }

      const result = host.store.insertSubmissions(subs)
      return { ok: true, ...result }
    },
    presentCall: () => ({ card: 'generic', title: '手动导入' }),
  }))
}
