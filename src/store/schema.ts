/** 存储数据模型：JSON 文件结构（替代 SQLite 表） */

import type { PlatformId, Verdict, TaskKind } from '../types.ts'

export interface ProblemRecord {
  platform: PlatformId
  problemKey: string
  title: string
  difficulty: number | null
  url: string | null
  tags: string[]
}

export interface SubmissionRecord {
  platform: PlatformId
  problemKey: string
  verdict: Verdict
  language?: string
  submittedAt: string
  externalId: string
}

export interface PlanTaskRecord {
  id: number
  taskDate: string
  title: string
  kind: TaskKind
  url?: string | null
  note?: string | null
  problemKey?: string
  platform?: PlatformId
  checked: boolean
}

export interface PlanRecord {
  id: number
  title: string
  goal: string
  startDate: string
  endDate: string
  source: 'ai' | 'template' | 'manual'
  rawPrompt?: string
  createdAt: string
  tasks: PlanTaskRecord[]
}

export interface ReviewRecord {
  id: number
  platform: PlatformId
  problemKey: string
  title: string
  difficulty: number | null
  url: string | null
  tags: string[]
  stage: number
  note: string | null
  nextDueOn: string
  lastReviewedAt: string | null
  addedAt: string
}

export interface TemplateProgressRecord {
  templateId: string
  status: 'todo' | 'learning' | 'mastered'
  note: string | null
}

export interface SettingsRecord {
  handles: Partial<Record<PlatformId, string>>
  ai: {
    enabled: boolean
    baseURL: string
    apiKey: string
    model: string
  }
}

/** 全部存储状态（一个 JSON 文件或拆成多个） */
export interface StoreState {
  problems: ProblemRecord[]
  submissions: SubmissionRecord[]
  plans: PlanRecord[]
  reviews: ReviewRecord[]
  templateProgress: TemplateProgressRecord[]
  settings: SettingsRecord
}

export function defaultState(): StoreState {
  return {
    problems: [],
    submissions: [],
    plans: [],
    reviews: [],
    templateProgress: [],
    settings: {
      handles: {},
      ai: {
        enabled: false,
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: '',
        model: 'deepseek-chat',
      },
    },
  }
}
