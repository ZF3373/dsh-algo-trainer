/** 今日训练选题（移植自原 icpc-workbench，纯函数） */

import type { TodayBandKey, TodayProblem } from '../types.ts'

export interface CandidateProblem {
  id: number
  platform: string
  problemKey: string
  title: string
  difficulty: number | null
  url: string | null
  tags: string[]
}

export interface BandRange {
  key: TodayBandKey
  label: string
  description: string
  min: number | null
  max: number | null
  center: number | null
}

export const BAND_LABELS: Record<TodayBandKey, { label: string; description: string }> = {
  consolidation: { label: '巩固区', description: '略低于当前水平，练稳定性和手感' },
  core: { label: '同段区', description: '贴合当前水平，每天最主要的能力训练' },
  challenge: { label: '挑战区', description: '略高于当前水平，试探新的上限' },
}

export function bandRanges(level: number): Record<TodayBandKey, BandRange> {
  return {
    consolidation: {
      ...BAND_LABELS.consolidation, key: 'consolidation',
      min: level - 200, max: level - 1, center: level - 100,
    },
    core: {
      ...BAND_LABELS.core, key: 'core',
      min: level, max: level + 200, center: level + 100,
    },
    challenge: {
      ...BAND_LABELS.challenge, key: 'challenge',
      min: level + 201, max: level + 400, center: level + 300,
    },
  }
}

export function estimateLevel(acDifficulties: number[], fallback = 1200): number {
  const xs = acDifficulties.filter((d) => Number.isFinite(d)).sort((a, b) => a - b)
  if (xs.length === 0) return fallback
  const mid = Math.floor(xs.length / 2)
  const median = xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2)
  return Math.round(median / 100) * 100
}

function weakOverlap(tags: string[], weakTags: string[]): string[] {
  const weak = new Set(weakTags)
  return tags.filter((t) => weak.has(t))
}

export function pickBand(
  candidates: CandidateProblem[],
  band: BandRange,
  count: number,
  weakTags: string[],
  excludeIds: Set<number>,
  rotate = 0,
): { problems: TodayProblem[]; pool: number } {
  const inBand = candidates.filter(
    (c) =>
      c.difficulty != null &&
      band.min != null &&
      band.max != null &&
      c.difficulty >= band.min &&
      c.difficulty <= band.max &&
      !excludeIds.has(c.id),
  )
  const ordered = inBand
    .map((c) => ({ c, weak: weakOverlap(c.tags, weakTags) }))
    .sort(
      (a, b) =>
        b.weak.length - a.weak.length ||
        Math.abs((a.c.difficulty ?? 0) - (band.center ?? 0)) -
          Math.abs((b.c.difficulty ?? 0) - (band.center ?? 0)) ||
        a.c.id - b.c.id,
    )
  const start = ordered.length ? rotate % ordered.length : 0
  const picked = [...ordered.slice(start), ...ordered.slice(0, start)].slice(0, count)
  return {
    pool: inBand.length,
    problems: picked.map(({ c, weak }) => ({
      id: c.id,
      platform: c.platform as TodayProblem['platform'],
      problemKey: c.problemKey,
      title: c.title,
      difficulty: c.difficulty,
      url: c.url,
      tags: c.tags,
      weakTags: weak,
    })),
  }
}
