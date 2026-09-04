/**
 * 统计引擎（移植自原 icpc-workbench，去掉 DB 依赖）。
 * 输入为 SubmissionRow[]（store.getSubmissionRows 输出），纯函数运算。
 */

import type { PlatformId } from '../types.ts'
import type { SubmissionRow, StatsFilter } from '../store/index.ts'
import { filterNoiseTags } from './tags.ts'

export function bucketForDifficulty(difficulty: number | null | undefined): string {
  if (difficulty === null || difficulty === undefined || !Number.isFinite(difficulty)) {
    return '未知'
  }
  const bounds = [1200, 1400, 1600, 1900, 2200]
  const labels = ['<1200', '1200-1399', '1400-1599', '1600-1899', '1900-2199', '2200+']
  for (let i = 0; i < bounds.length; i += 1) {
    if (difficulty < bounds[i]) return labels[i]
  }
  return labels[labels.length - 1]
}

export interface CountStat {
  attempts: number
  ac: number
  acRate: number
}

export interface TagStat extends CountStat {
  tag: string
  solved: number
}

export interface DifficultyStat extends CountStat {
  bucket: string
}

export interface PlatformStat extends CountStat {
  platform: PlatformId
  solved: number
}

export interface OverallStats extends CountStat {
  solvedProblems: number
  byPlatform: PlatformStat[]
  byDifficulty: DifficultyStat[]
  byTag: TagStat[]
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

export function rate(attempts: number, ac: number): number {
  return attempts === 0 ? 0 : Math.round((ac / attempts) * 1000) / 10
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

export function computeOverall(rows: SubmissionRow[], filter: StatsFilter = {}): OverallStats {
  const filtered = rows.filter((r) => {
    if (filter.platform && r.platform !== filter.platform) return false
    if (filter.from && r.submittedAt < filter.from) return false
    if (filter.to && r.submittedAt > filter.to) return false
    return true
  })

  const PLATFORMS: PlatformId[] = ['codeforces', 'atcoder']
  const byPlatform = new Map<PlatformId, MutableStat>()
  for (const p of PLATFORMS) byPlatform.set(p, { attempts: 0, ac: 0 })
  const byDifficulty = new Map<string, MutableStat>()
  const byTag = new Map<string, MutableStat>()
  const solvedSet = new Set<string>()
  const solvedByTag = new Map<string, Set<string>>()
  const solvedByPlatform = new Map<PlatformId, Set<string>>()

  for (const r of filtered) {
    const isAc = r.verdict === 'AC'
    bump(byPlatform, r.platform, isAc)
    bump(byDifficulty, bucketForDifficulty(r.difficulty), isAc)
    for (const tag of filterNoiseTags(r.tags)) {
      bump(byTag, tag, isAc)
      if (isAc) {
        if (!solvedByTag.has(tag)) solvedByTag.set(tag, new Set())
        solvedByTag.get(tag)!.add(`${r.platform}:${r.problemKey}`)
      }
    }
    if (isAc) {
      solvedSet.add(`${r.platform}:${r.problemKey}`)
      if (!solvedByPlatform.has(r.platform)) solvedByPlatform.set(r.platform, new Set())
      solvedByPlatform.get(r.platform)!.add(r.problemKey)
    }
  }

  const toStat = (s: MutableStat): CountStat => ({
    attempts: s.attempts,
    ac: s.ac,
    acRate: rate(s.attempts, s.ac),
  })

  return {
    attempts: filtered.length,
    ac: filtered.filter((r) => r.verdict === 'AC').length,
    acRate: rate(filtered.length, filtered.filter((r) => r.verdict === 'AC').length),
    solvedProblems: solvedSet.size,
    byPlatform: [...byPlatform.entries()].map(([platform, s]) => ({
      platform,
      ...toStat(s),
      solved: solvedByPlatform.get(platform)?.size ?? 0,
    })),
    byDifficulty: [...byDifficulty.entries()].map(([bucket, s]) => ({ bucket, ...toStat(s) })),
    byTag: [...byTag.entries()].map(([tag, s]) => ({
      tag,
      ...toStat(s),
      solved: solvedByTag.get(tag)?.size ?? 0,
    })),
  }
}
