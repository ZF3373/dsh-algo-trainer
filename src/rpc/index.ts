/**
 * Host RPC bridge：暴露少量只读方法供 client 仪表盘面板拉数据。
 * 通过 dsh rpc.handle 注册，client 用 rpc.call 调用。
 */

import type { IcpcHost } from '../index.ts'
import type { Context } from '../dsh-compat.ts'
import { computeOverall } from '../analysis/stats.ts'
import { computeWeakness } from '../analysis/weakness.ts'
import { computeTrend } from '../analysis/trend.ts'
import { bandRanges, estimateLevel, pickBand, type CandidateProblem } from '../analysis/today.ts'
import type { TodayBandKey } from '../types.ts'

const BAND_KEYS: TodayBandKey[] = ['consolidation', 'core', 'challenge']
const DEFAULT_COUNTS: Record<TodayBandKey, number> = { consolidation: 2, core: 3, challenge: 1 }

export function registerRpcHandlers(host: IcpcHost, ctx: Context): void {
  // 仪表盘总览：统计 + 今日训练 + 打卡连续 + 到期复习
  ctx.rpc.handle('icpc.dashboard', async () => {
    const { store } = host
    const todayStr = new Date().toISOString().slice(0, 10)
    const rows = store.getSubmissionRows()
    const stats = computeOverall(rows)
    const weakness = computeWeakness(rows, { minAttempts: 5, topN: 5 })

    // 今日训练
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
    let recentDiffs = store.getRecentAcDifficulties(since)
    if (recentDiffs.length < 5) recentDiffs = store.getRecentAcDifficulties('1970-01-01')
    const level = estimateLevel(recentDiffs)
    const candidates: CandidateProblem[] = store.getUnsolvedCandidates().map((p) => ({
      id: p.id, platform: p.platform, problemKey: p.problemKey,
      title: p.title, difficulty: p.difficulty, url: p.url, tags: p.tags,
    }))
    const weakTags = weakness.items.filter((i) => i.gap > 0).map((i) => i.tag)
    const ranges = bandRanges(level)
    const exclude = new Set<number>()
    const bands = BAND_KEYS.map((key) => {
      const picked = pickBand(candidates, ranges[key], DEFAULT_COUNTS[key], weakTags, exclude, 0)
      for (const p of picked.problems) exclude.add(p.id)
      return {
        key, label: ranges[key].label, description: ranges[key].description,
        problems: picked.problems, pool: picked.pool,
      }
    })

    const streak = store.getStreak(todayStr)
    const dueReviews = store.getDueCount()
    const tasks = store.getTasksByDate(todayStr)
    const checked = tasks.filter((t) => t.checked).length

    return {
      stats, weakness: { items: weakness.items.slice(0, 5) }, level,
      bands, streak, dueReviews,
      todayTasks: tasks,
      todayProgress: tasks.length > 0 ? { total: tasks.length, checked } : null,
    }
  })

  // 趋势图数据
  ctx.rpc.handle('icpc.trend', async (params) => {
    const weeks = typeof params === 'object' && params !== null && 'weeks' in params
      ? Number((params as { weeks: unknown }).weeks) || 12 : 12
    return computeTrend(host.store.getSubmissionRows(), weeks)
  })

  // 近期赛事
  ctx.rpc.handle('icpc.contests', async () => {
    const now = Date.now()
    const all = []
    for (const pf of ['codeforces', 'atcoder'] as const) {
      try {
        const adapter = host.adapters[pf]
        if (!adapter) continue
        const contests = await adapter.fetchContests()
        all.push(...contests)
      } catch {
        // 单源失败降级
      }
    }
    const upcoming = all
      .filter((c) => {
        if (!c.startTimeIso) return false
        return new Date(c.startTimeIso).getTime() > now
      })
      .sort((a, b) => new Date(a.startTimeIso!).getTime() - new Date(b.startTimeIso!).getTime())
      .slice(0, 10)
    return { contests: upcoming }
  })
}
