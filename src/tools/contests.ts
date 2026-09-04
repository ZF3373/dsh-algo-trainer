import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, num } from './helpers.ts'
import type { ContestInfo, PlatformId } from '../types.ts'

export function contestPhase(c: { startTimeIso: string | null; durationMinutes: number }, now = Date.now()): 'upcoming' | 'running' | 'finished' | null {
  if (!c.startTimeIso) return null
  const start = new Date(c.startTimeIso).getTime()
  const end = start + c.durationMinutes * 60_000
  if (now < start) return 'upcoming'
  if (now < end) return 'running'
  return 'finished'
}

export function registerContestTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_contests',
    description:
      '查询多平台赛事列表。聚合 Codeforces / AtCoder 公开赛事。' +
      'type=upcoming 即将开始（按时间升序）；type=finished 已结束（按结束时间降序）。',
    parameters: {
      type: { type: 'string', enum: ['upcoming', 'finished'], default: 'upcoming' },
      platform: { type: 'string', enum: ['codeforces', 'atcoder'] },
      limit: { type: 'number', description: '返回上限（默认 40）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const type = (args.type as string) === 'finished' ? 'finished' : 'upcoming'
      const platformFilter = args.platform as string | undefined
      const limit = num(args.limit, 40, 1, 100)
      const now = Date.now()

      const sources: PlatformId[] = platformFilter ? [platformFilter as PlatformId] : ['codeforces', 'atcoder']
      const all: ContestInfo[] = []
      const failures: Record<string, string> = {}

      for (const pf of sources) {
        try {
          const adapter = host.adapters[pf]
          if (!adapter) continue
          const contests = await adapter.fetchContests()
          all.push(...contests)
        } catch (e) {
          failures[pf] = (e as Error).message
        }
      }

      if (all.length === 0) {
        return { ok: false, error: '赛事拉取失败：' + Object.entries(failures).map(([p, m]) => `${p}: ${m}`).join('；') }
      }

      const filtered = all
        .filter((c) => contestPhase(c, now) === type)
        .sort((a, b) => {
          if (type === 'upcoming') {
            return new Date(a.startTimeIso!).getTime() - new Date(b.startTimeIso!).getTime()
          }
          const endA = new Date(a.startTimeIso!).getTime() + a.durationMinutes * 60_000
          const endB = new Date(b.startTimeIso!).getTime() + b.durationMinutes * 60_000
          return endB - endA
        })
        .slice(0, limit)

      return { ok: true, contests: filtered, failures }
    },
    presentCall: (args) => ({ card: 'generic', title: `赛事：${args.type || 'upcoming'}` }),
  }))
}
