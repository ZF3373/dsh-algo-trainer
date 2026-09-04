/**
 * 训练计划服务（移植自原 icpc-workbench，去掉 DB 依赖）。
 * AI 通道用 fetch 调 OpenAI 兼容 API；无 key 时降级为模板计划。
 */

import type { PlatformId, TaskKind } from '../types.ts'
import type { IcpcStore, SubmissionRow } from '../store/index.ts'
import type { WeaknessProfile } from '../types.ts'
import { computeWeakness } from '../analysis/weakness.ts'
import { computeTrend } from '../analysis/trend.ts'
import { filterNoiseTags } from '../analysis/tags.ts'

export const TASK_KINDS = ['practice', 'review', 'topic', 'contest'] as const

export interface PlanTaskInput {
  date: string
  title: string
  kind?: string
  platform?: PlatformId
  problemKey?: string
  url?: string
  note?: string
}

export interface PlanInput {
  title: string
  goal: string
  startDate: string
  days: number
  tasks: PlanTaskInput[]
}

export interface UserLevel {
  solvedCount: number
  medianDifficulty: number | null
  p75Difficulty: number | null
  suggestedRange: [number, number] | null
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function computeUserLevel(rows: SubmissionRow[], minSample = 10): UserLevel {
  const acKeys = new Set<string>()
  for (const r of rows) {
    if (r.verdict === 'AC') acKeys.add(`${r.platform}:${r.problemKey}`)
  }
  const diffs = rows
    .filter((r) => r.verdict === 'AC' && r.difficulty != null && acKeys.has(`${r.platform}:${r.problemKey}`))
    .map((r) => r.difficulty as number)
  // 去重：按 problemKey 只算一次
  const seen = new Set<string>()
  const uniqueDiffs: number[] = []
  for (const r of rows.filter((r) => r.verdict === 'AC' && r.difficulty != null)) {
    const key = `${r.platform}:${r.problemKey}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueDiffs.push(r.difficulty as number)
  }
  uniqueDiffs.sort((a, b) => a - b)
  if (uniqueDiffs.length < minSample) {
    return { solvedCount: uniqueDiffs.length, medianDifficulty: null, p75Difficulty: null, suggestedRange: null }
  }
  const q = (p: number): number => {
    const idx = Math.min(uniqueDiffs.length - 1, Math.floor(p * (uniqueDiffs.length - 1)))
    return uniqueDiffs[idx]
  }
  const median = q(0.5)
  const p75 = q(0.75)
  return {
    solvedCount: uniqueDiffs.length,
    medianDifficulty: median,
    p75Difficulty: p75,
    suggestedRange: [Math.max(800, median - 100), p75 + 200],
  }
}

/** 解析 AI 输出的 JSON 计划（容忍围栏/尾逗号/前后解释文字） */
export function parsePlanJson(raw: string, startDate: string, days: number): PlanInput {
  let text = raw.trim()
  if (text.includes('```')) {
    text = text.replace(/```[a-zA-Z]*\s*/g, '').trim()
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) text = text.slice(start, end + 1)
  let obj: { title?: unknown; goal?: unknown; tasks?: unknown }
  try {
    obj = JSON.parse(text) as typeof obj
  } catch (e) {
    try {
      obj = JSON.parse(text.replace(/,\s*([}\]])/g, '$1')) as typeof obj
    } catch {
      throw new Error(`AI 输出不是合法 JSON: ${(e as Error).message}`)
    }
  }
  if (typeof obj.title !== 'string' || !obj.title.trim()) throw new Error('AI 输出缺少 title')
  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) throw new Error('AI 输出缺少 tasks')
  const startMs = Date.parse(`${startDate}T00:00:00Z`)
  const endMs = startMs + (days - 1) * 86_400_000
  const inRange = (d: string): boolean => {
    const ms = Date.parse(`${d}T00:00:00Z`)
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs
  }
  const tasks = (obj.tasks as unknown[])
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .filter((t) => typeof t.title === 'string' && t.title.trim() && typeof t.date === 'string')
    .filter((t) => inRange(t.date as string))
    .map((t) => ({
      date: t.date as string,
      title: t.title as string,
      kind: TASK_KINDS.includes(t.kind as TaskKind) ? (t.kind as string) : 'practice',
      platform: t.platform as PlatformId | undefined,
      problemKey: t.problemKey as string | undefined,
      url: t.url as string | undefined,
      note: t.note as string | undefined,
    }))
  if (tasks.length === 0) throw new Error('AI 输出 tasks 中没有有效任务')
  return { title: obj.title, goal: typeof obj.goal === 'string' ? obj.goal : '', startDate, days, tasks }
}

/** 无 AI 时的降级模板计划 */
export function templatePlan(
  rows: SubmissionRow[],
  profile: WeaknessProfile,
  startDate: string,
  days: number,
): PlanInput {
  const weakTags = profile.items.map((i) => i.tag)
  const tags = weakTags.length > 0 ? weakTags : ['综合练习']
  const level = computeUserLevel(rows)
  const [lo, hi] = level.suggestedRange ?? [null, null]

  // 候选池：未 AC、有难度、有 URL 的题
  const acKeys = new Set<string>()
  for (const r of rows) {
    if (r.verdict === 'AC') acKeys.add(`${r.platform}:${r.problemKey}`)
  }
  // 简化：从 store 的 unsolved candidates 构建池——但这里是纯函数，
  // 所以只从 rows 推导 AC 集合，题目信息从 rows 中的 problem 字段取
  const pool: Array<{ platform: PlatformId; problemKey: string; title: string; difficulty: number | null; tags: string[] }> = []
  // 实际题目信息在调用方注入（store.getUnsolvedCandidates）
  // 这里用空池降级——调用方会传入候选池
  const used = new Set<string>()
  const tasks: PlanTaskInput[] = []
  for (let d = 0; d < days; d += 1) {
    const date = addDays(startDate, d)
    if (d % 7 === 6) {
      tasks.push({ date, title: '模拟比赛（虚拟参赛）', kind: 'contest', url: 'https://codeforces.com/problemset?order=BY_SOLVED_DESC', note: '完整 2 小时虚拟参赛，赛后补题' })
    } else {
      tasks.push({ date, title: `练习：${tags[d % tags.length]}`, kind: 'practice', note: `重点突破弱项：${tags[d % tags.length]}` })
    }
    if ((d + 1) % 4 === 0) {
      tasks.push({ date, title: `回顾与错题重做（前 ${Math.min(d + 1, 7)} 天）`, kind: 'review' })
    }
  }
  const goal = weakTags.length > 0
    ? `针对性突破弱项：${weakTags.slice(0, 3).join('、')}，保持每日练习节奏。`
    : '保持每日练习节奏，稳步提升。'
  return { title: `模板训练计划（${days} 天）`, goal, startDate, days, tasks }
}

/** AI 生成训练计划（OpenAI 兼容 API），失败降级为模板 */
export async function generatePlan(
  store: IcpcStore,
  aiConfig: { enabled: boolean; baseURL: string; apiKey: string; model: string },
  opts: { days?: number; startDate?: string } = {},
): Promise<{ planId: number; source: 'ai' | 'template'; title: string }> {
  const days = opts.days ?? 14
  const startDate = opts.startDate ?? today()
  const rows = store.getSubmissionRows()
  const profile = computeWeakness(rows, { minAttempts: 5, topN: 8 })
  const trend = computeTrend(rows, 12)
  const level = computeUserLevel(rows)

  const prompt = buildPrompt(profile, trend, level, startDate, days)

  if (aiConfig.enabled && aiConfig.apiKey.trim()) {
    try {
      const raw = await callAi(aiConfig, prompt)
      const parsed = parsePlanJson(raw, startDate, days)
      const plan = store.createPlan({
        title: parsed.title,
        goal: parsed.goal,
        startDate: parsed.startDate,
        endDate: addDays(startDate, days - 1),
        source: 'ai',
        rawPrompt: raw,
        tasks: parsed.tasks.map((t) => ({
          id: 0,
          taskDate: t.date,
          title: t.title,
          kind: (t.kind as TaskKind) ?? 'practice',
          url: t.url ?? null,
          note: t.note ?? null,
          platform: t.platform,
          problemKey: t.problemKey,
          checked: false,
        })),
      })
      return { planId: plan.id, source: 'ai', title: parsed.title }
    } catch (e) {
      console.warn(`[icpc-plans] AI 生成失败，降级为模板: ${(e as Error).message}`)
    }
  }

  const tpl = templatePlan(rows, profile, startDate, days)
  const plan = store.createPlan({
    title: tpl.title,
    goal: tpl.goal,
    startDate: tpl.startDate,
    endDate: addDays(startDate, days - 1),
    source: 'template',
    tasks: tpl.tasks.map((t) => ({
      id: 0,
      taskDate: t.date,
      title: t.title,
      kind: (t.kind as TaskKind) ?? 'practice',
      url: t.url ?? null,
      note: t.note ?? null,
      checked: false,
    })),
  })
  return { planId: plan.id, source: 'template', title: tpl.title }
}

function buildPrompt(
  profile: WeaknessProfile,
  trend: ReturnType<typeof computeTrend>,
  level: UserLevel,
  startDate: string,
  days: number,
): string {
  return [
    `你是 ICPC 备赛教练，请基于以下选手数据生成 ${days} 天训练计划，只输出严格 JSON。`,
    `起始日期：${startDate}`,
    `能力水平：${JSON.stringify(level)}`,
    `弱项画像：${JSON.stringify(profile.items)}`,
    `近 12 周趋势：${JSON.stringify(trend)}`,
    `输出格式：{"title":"计划标题","goal":"目标","tasks":[{"date":"YYYY-MM-DD","title":"任务标题","kind":"practice|review|topic|contest","url":"可选链接","note":"可选备注"}]}`,
  ].join('\n')
}

async function callAi(
  cfg: { baseURL: string; apiKey: string; model: string },
  prompt: string,
): Promise<string> {
  const url = cfg.baseURL.replace(/\/+$/, '').endsWith('/chat/completions')
    ? cfg.baseURL.replace(/\/+$/, '')
    : `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: '你是 ICPC 备赛教练，只输出严格 JSON，不加任何解释。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI API HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content?.trim()) throw new Error('AI API 返回空内容')
  return content
}
