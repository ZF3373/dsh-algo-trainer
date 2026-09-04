import type { PlatformId } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, str, num } from './helpers.ts'
import { computeOverall } from '../analysis/stats.ts'
import { computeWeakness } from '../analysis/weakness.ts'
import { computeTrend } from '../analysis/trend.ts'

export function registerStatsTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_stats',
    description:
      '查询刷题统计。metric=overall 总体统计（尝试/AC/AC率/各平台/各难度/各标签）；' +
      'metric=weakness 弱项画像（各标签/难度桶相对自身均值的偏差，gap>0 为弱项）；' +
      'metric=trend 最近 N 周趋势。',
    parameters: {
      metric: { type: 'string', enum: ['overall', 'weakness', 'trend'], default: 'overall' },
      from: { type: 'string', description: '起始时间 ISO8601（overall）' },
      to: { type: 'string', description: '截止时间 ISO8601（overall）' },
      platform: { type: 'string', enum: ['codeforces', 'atcoder'], description: '限定平台（overall）' },
      weeks: { type: 'number', description: '趋势周数（trend，默认 12）' },
      minAttempts: { type: 'number', description: '弱项最小尝试次数（默认 5）' },
      topN: { type: 'number', description: '弱项返回条数（默认 10）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const rows = host.store.getSubmissionRows()
      const metric = (args.metric as string) || 'overall'

      if (metric === 'overall') {
        return {
          ok: true,
          data: computeOverall(rows, {
            from: str(args.from),
            to: str(args.to),
            platform: args.platform as PlatformId | undefined,
          }),
        }
      }
      if (metric === 'weakness') {
        return {
          ok: true,
          data: computeWeakness(rows, {
            minAttempts: num(args.minAttempts, 5, 1, 1000),
            topN: num(args.topN, 10, 1, 100),
          }),
        }
      }
      return { ok: true, data: computeTrend(rows, num(args.weeks, 12, 1, 52)) }
    },
    presentCall: (args) => ({ card: 'generic', title: `统计：${args.metric || 'overall'}` }),
  }))
}
