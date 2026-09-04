/** 间隔复习调度（移植自原 icpc-workbench，纯函数） */

import type { ReviewFeedback } from '../types.ts'

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60] as const
export const MAX_STAGE = REVIEW_INTERVALS.length - 1

export function intervalDaysForStage(stage: number): number {
  return REVIEW_INTERVALS[Math.min(Math.max(0, Math.floor(stage)), MAX_STAGE)]
}

export function nextStage(stage: number, feedback: ReviewFeedback): number {
  if (feedback === 'hard') return 0
  if (feedback === 'easy') return Math.min(stage + 2, MAX_STAGE)
  return Math.min(stage + 1, MAX_STAGE)
}

export function dateAfterDays(baseDate: string, days: number): string {
  const d = new Date(`${baseDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function scheduleNext(
  stage: number,
  feedback: ReviewFeedback,
  todayStr: string,
): { stage: number; nextDueOn: string } {
  const s = nextStage(stage, feedback)
  return { stage: s, nextDueOn: dateAfterDays(todayStr, intervalDaysForStage(s)) }
}
