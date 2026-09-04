/** 跨模块共享类型与常量（CF + AtCoder 首版） */

export type PlatformId = 'codeforces' | 'atcoder'

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE' | 'MLE' | 'CE' | 'SKIPPED'

export interface NormalizedProblem {
  platform: PlatformId
  problemKey: string
  title: string
  difficulty?: number
  url?: string
  tags: string[]
}

export interface NormalizedSubmission {
  problem: NormalizedProblem
  verdict: Verdict
  language?: string
  submittedAt: string
  externalId: string
}

export interface WeaknessItem {
  tag: string
  attempts: number
  ac: number
  acRate: number
  avgAcRate: number
  gap: number
  solved: number
}

export interface DifficultyWeakness {
  bucket: string
  attempts: number
  ac: number
  acRate: number
  gap: number
}

export interface WeaknessProfile {
  items: WeaknessItem[]
  byDifficulty: DifficultyWeakness[]
  generatedAt: string
}

export type ReviewFeedback = 'hard' | 'ok' | 'easy'

export type TodayBandKey = 'consolidation' | 'core' | 'challenge'

export interface TodayProblem {
  id: number
  platform: PlatformId
  problemKey: string
  title: string
  difficulty: number | null
  url: string | null
  tags: string[]
  weakTags: string[]
}

export interface TodayBand {
  key: TodayBandKey
  label: string
  description: string
  range: [number | null, number | null]
  problems: TodayProblem[]
  pool: number
}

export interface TodayPlan {
  date: string
  level: number
  bands: TodayBand[]
  dueReviews: number
  planProgress: { total: number; checked: number } | null
}

export interface ContestInfo {
  id: string
  platform: PlatformId
  name: string
  category: string
  startTimeIso: string | null
  durationMinutes: number
  phase: string
  url: string
}

export type TaskKind = 'practice' | 'review' | 'topic' | 'contest'
