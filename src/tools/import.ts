import type { PlatformId, Verdict } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'
import { parseCsvRows } from '../import/csv.ts'

const VERDICTS: readonly Verdict[] = ['AC', 'WA', 'TLE', 'RE', 'MLE', 'CE', 'SKIPPED']

/** 解析提交时间；无效值回退为当前时间，避免 RangeError 抛给调用方 */
function parseDateSafe(v: string | undefined): string {
  if (v) {
    const t = Date.parse(v)
    if (Number.isFinite(t)) return new Date(t).toISOString()
  }
  return new Date().toISOString()
}

interface ManualRow {
  problemKey: string
  title?: string
  verdict?: string
  difficulty?: number
  tags?: string[] | string
  url?: string
  submittedAt?: string
  language?: string
  externalId?: string
}

export function registerImportTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_import',
    description:
      '手动导入刷题记录。action=manual 用 JSON 数组导入；action=csv 用 CSV 文本导入。' +
      'CSV 表头需含 problemKey,title,verdict,difficulty,tags,url,submittedAt,language,externalId。' +
      '按 externalId 去重；缺省为 manual:<platform>:<problemKey>:<verdict>。',
    parameters: {
      action: { type: 'string', required: true, enum: ['manual', 'csv'] },
      platform: { type: 'string', required: true, enum: ['codeforces', 'atcoder'] },
      rows: { type: 'array', items: { type: 'object' }, description: 'JSON 行数组（manual）' },
      csv: { type: 'string', description: 'CSV 文本（csv）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const platform = args.platform as PlatformId
      if (!['codeforces', 'atcoder'].includes(platform)) return { ok: false, error: 'platform 非法' }
      const action = args.action as string

      if (action === 'csv') {
        if (typeof args.csv !== 'string') return { ok: false, error: 'csv 必须是字符串' }
        try {
          const parsed = parseCsvRows(platform, args.csv)
          // upsert problems from parsed rows
          for (const r of parsed) {
            host.store.upsertProblem({
              platform: r.platform as PlatformId,
              problemKey: r.problemKey,
              title: r.title,
              difficulty: r.difficulty,
              url: r.url,
              tags: r.tags,
            })
          }
          const result = host.store.insertSubmissions(parsed.map((r) => ({
            platform: r.platform as PlatformId,
            problemKey: r.problemKey,
            verdict: r.verdict as Verdict,
            language: r.language,
            submittedAt: r.submittedAt,
            externalId: r.externalId,
          })))
          return { ok: true, ...result }
        } catch (e) {
          return { ok: false, error: (e as Error).message }
        }
      }

      // manual
      if (!Array.isArray(args.rows)) return { ok: false, error: 'rows 必须是数组' }
      const subs = (args.rows as unknown[]).map((row, i) => {
        const r = row as ManualRow
        const problemKey = String(r.problemKey ?? '').trim()
        if (!problemKey) throw new Error(`第 ${i + 1} 行缺少 problemKey`)
        const verdictRaw = String(r.verdict ?? 'SKIPPED').trim().toUpperCase()
        if (!(VERDICTS as readonly string[]).includes(verdictRaw)) throw new Error(`第 ${i + 1} 行 verdict 非法: ${r.verdict}`)
        const tags = Array.isArray(r.tags)
          ? r.tags.map(String).filter(Boolean)
          : typeof r.tags === 'string' ? r.tags.split('|').map((t) => t.trim()).filter(Boolean) : []
        // 同题同 verdict 的多条提交也要各自保留：externalId 追加序号与时间戳，避免被去重合并
        const externalId = r.externalId ?? `manual:${platform}:${problemKey}:${verdictRaw}:${Date.now()}:${i}`
        const difficulty = r.difficulty !== undefined ? Number(r.difficulty) : NaN
        return {
          platform,
          problemKey,
          verdict: verdictRaw as Verdict,
          language: r.language?.trim() || undefined,
          submittedAt: parseDateSafe(r.submittedAt),
          externalId,
          title: r.title?.trim() || problemKey,
          difficulty: Number.isFinite(difficulty) ? difficulty : null,
          url: r.url?.trim() || null,
          tags,
        }
      })

      // upsert problems with full metadata
      for (const s of subs) {
        host.store.upsertProblem({
          platform: s.platform,
          problemKey: s.problemKey,
          title: s.title,
          difficulty: s.difficulty,
          url: s.url,
          tags: s.tags,
        })
      }

      const result = host.store.insertSubmissions(subs.map((s) => ({
        platform: s.platform,
        problemKey: s.problemKey,
        verdict: s.verdict,
        language: s.language,
        submittedAt: s.submittedAt,
        externalId: s.externalId,
      })))
      return { ok: true, ...result }
    },
    presentCall: () => ({ card: 'generic', title: '手动导入' }),
  }))
}
