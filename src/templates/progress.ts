/** 模板进度管理（移植自原 icpc-workbench 的 progress.ts） */

import { CURRICULUM, type TemplateItem } from './curriculum.ts'

export type TemplateStatus = 'todo' | 'learning' | 'mastered'
export const TEMPLATE_STATUSES: TemplateStatus[] = ['todo', 'learning', 'mastered']

export interface ProgressEntry {
  status: TemplateStatus
  note: string | null
}

export function isTemplateId(id: string): boolean {
  return CURRICULUM.some((c) => c.templates.some((t) => t.id === id))
}

export function findTemplate(id: string): TemplateItem | undefined {
  for (const c of CURRICULUM) {
    const t = c.templates.find((x) => x.id === id)
    if (t) return t
  }
  return undefined
}

/** 下一课推荐：优先「学习中」的，否则第一个「未学」的 */
export function nextTemplate(progress: Map<string, ProgressEntry>): TemplateItem | undefined {
  let firstTodo: TemplateItem | undefined
  for (const cat of CURRICULUM) {
    for (const t of cat.templates) {
      const s = progress.get(t.id)?.status ?? 'todo'
      if (s === 'learning') return t
      if (s === 'todo' && !firstTodo) firstTodo = t
    }
  }
  return firstTodo
}

export const TEMPLATE_TOTAL = CURRICULUM.reduce((n, c) => n + c.templates.length, 0)
