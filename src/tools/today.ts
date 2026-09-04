import type { TodayBandKey } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, num } from './helpers.ts'
import { computeWeakness } from '../analysis/weakness.ts'
import { bandRanges, estimateLevel, pickBand, type CandidateProblem } from '../analysis/today.ts'

const DEFAULT_COUNTS: Record<TodayBandKey, number> = { consolidation: 2, core: 3, challenge: 1 }
const BAND_KEYS: TodayBandKey[] = ['consolidation', 'core', 'challenge']

export function registerTodayTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_today',
    description:
      '获取今日三档训练推荐。系统根据近期 AC 难度中位数估算能力值，' +
      '按巩固区/同段区/挑战区三档推荐题目，弱项标签优先。' +
      '同时返回到期复习数和今日计划进度。',
    parameters: {
      consolidation: { type: 'number', description: '巩固区题量（默认 2）' },
      core: { type: 'number', description: '同段区题量（默认 3）' },
      challenge: { type: 'number', description: '挑战区题量（默认 1）' },
      rotate: { type: 'number', description: '换一批偏移量' },
      windowDays: { type: 'number', description: '能力值窗口天数（默认 60）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const todayStr = new Date().toISOString().slice(0, 10)
      const windowDays = num(args.windowDays, 60, 7, 365)
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

      // 能力值
      let recentDiffs = store.getRecentAcDifficulties(since)
      if (recentDiffs.length < 5) recentDiffs = store.getRecentAcDifficulties('1970-01-01')
      const level = estimateLevel(recentDiffs)

      // 候选题
      const candidates: CandidateProblem[] = store.getUnsolvedCandidates().map((p) => ({
        id: p.id,
        platform: p.platform,
        problemKey: p.problemKey,
        title: p.title,
        difficulty: p.difficulty,
        url: p.url,
        tags: p.tags,
      }))

      // 弱项
      const rows = store.getSubmissionRows()
      const weakness = computeWeakness(rows, { minAttempts: 5, topN: 15 })
      const weakTags = weakness.items.filter((i) => i.gap > 0).map((i) => i.tag)

      // 逐档选题
      const ranges = bandRanges(level)
      const rotate = num(args.rotate, 0, 0, 500)
      const exclude = new Set<number>()
      const bands = BAND_KEYS.map((key) => {
        const q = Number(args[key])
        const count = Number.isInteger(q) && q >= 0 && q <= 6 ? q : DEFAULT_COUNTS[key]
        const picked = pickBand(candidates, ranges[key], count, weakTags, exclude, rotate)
        for (const p of picked.problems) exclude.add(p.id)
        return {
          key, label: ranges[key].label, description: ranges[key].description,
          range: [ranges[key].min, ranges[key].max] as [number | null, number | null],
          problems: picked.problems, pool: picked.pool,
        }
      })

      // 到期复习 + 计划进度
      const dueReviews = store.getDueCount()
      const tasks = store.getTasksByDate(todayStr)
      const checked = tasks.filter((t) => t.checked).length

      return {
        ok: true,
        data: {
          date: todayStr, level, bands, dueReviews,
          planProgress: tasks.length > 0 ? { total: tasks.length, checked } : null,
        },
      }
    },
    presentCall: () => ({ card: 'generic', title: '今日训练推荐' }),
  }))
}
