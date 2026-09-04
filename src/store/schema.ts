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
  code: string | null
  idea: string | null
  complexity: string | null
  url: string | null
  masteredAt: string | null
}

export interface CustomTemplateRecord {
  id: number
  categoryKey: string
  name: string
  difficulty: number
  tags: string[]
  code: string
  idea: string | null
  complexity: string | null
  url: string | null
  createdAt: string
  updatedAt: string | null
}

export interface PlatformAccountRecord {
  platform: PlatformId
  handle: string
  lastSyncAt: string | null
  enabled: boolean
}

export interface SettingsRecord {
  accounts: Partial<Record<PlatformId, PlatformAccountRecord>>
  ai: {
    enabled: boolean
    baseURL: string
    apiKey: string
    model: string
  }
  adapterEnabled: Partial<Record<PlatformId, boolean>>
  cookies: Partial<Record<PlatformId, { cookie?: string; csrf?: string }>>
  reminder: {
    enabled: boolean
    time: string
  }
}

/** 全部存储状态（一个 JSON 文件） */
export interface StoreState {
  problems: ProblemRecord[]
  submissions: SubmissionRecord[]
  plans: PlanRecord[]
  reviews: ReviewRecord[]
  templateProgress: TemplateProgressRecord[]
  customTemplates: CustomTemplateRecord[]
  settings: SettingsRecord
}

export function defaultState(): StoreState {
  return {
    problems: [],
    submissions: [],
    plans: [],
    reviews: [],
    templateProgress: [],
    customTemplates: [],
    settings: {
      accounts: {},
      ai: {
        enabled: false,
        baseURL: 'https://api.deepseek.com/v1',
        apiKey: '',
        model: 'deepseek-chat',
      },
      adapterEnabled: {},
      cookies: {},
      reminder: { enabled: false, time: '20:00' },
    },
  }
}
