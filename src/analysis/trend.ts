/** 趋势分析（移植自原 icpc-workbench，纯函数） */

import type { SubmissionRow } from '../store/index.ts'
import { bucketForDifficulty } from './stats.ts'

export interface TrendPoint {
  week: string
  attempts: number
  ac: number
  solved: number
  avgDifficulty: number | null
  difficultyDist: Record<string, number>
}

export function getWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

interface MutableStat {
  attempts: number
  ac: number
}

function bump(map: Map<string, MutableStat>, key: string, isAc: boolean): void {
  const cur = map.get(key) ?? { attempts: 0, ac: 0 }
  cur.attempts += 1
  if (isAc) cur.ac += 1
  map.set(key, cur)
}

export function computeTrend(rows: SubmissionRow[], weeks = 12, now: Date = new Date()): TrendPoint[] {
  const byWeek = new Map<string, MutableStat>()
  const solvedByWeek = new Map<string, Set<string>>()
  const acDifficultyByWeek = new Map<string, number[]>()
  const distByWeek = new Map<string, Map<string, number>>()

  for (const r of rows) {
    const wk = getWeekKey(new Date(r.submittedAt))
    const isAc = r.verdict === 'AC'
    bump(byWeek, wk, isAc)
    if (isAc) {
      if (!solvedByWeek.has(wk)) solvedByWeek.set(wk, new Set())
      solvedByWeek.get(wk)!.add(`${r.platform}:${r.problemKey}`)
      if (r.difficulty !== null && Number.isFinite(r.difficulty)) {
        if (!acDifficultyByWeek.has(wk)) acDifficultyByWeek.set(wk, [])
        acDifficultyByWeek.get(wk)!.push(r.difficulty)
      }
      const bucket = bucketForDifficulty(r.difficulty)
      if (!distByWeek.has(wk)) distByWeek.set(wk, new Map())
      const dist = distByWeek.get(wk)!
      dist.set(bucket, (dist.get(bucket) ?? 0) + 1)
    }
  }

  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (weeks - 1) * 7 * 86400000,
  )
  const points: TrendPoint[] = []
  for (let i = 0; i < weeks; i++) {
    const wk = getWeekKey(cursor)
    const s = byWeek.get(wk) ?? { attempts: 0, ac: 0 }
    const diffs = acDifficultyByWeek.get(wk) ?? []
    const avg = diffs.length === 0
      ? null
      : Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10
    const dist: Record<string, number> = {}
    for (const [bucket, count] of distByWeek.get(wk) ?? new Map()) {
      dist[bucket] = count
    }
    points.push({
      week: wk,
      attempts: s.attempts,
      ac: s.ac,
      solved: solvedByWeek.get(wk)?.size ?? 0,
      avgDifficulty: avg,
      difficultyDist: dist,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return points
}
