/**
 * 训练计划服务（完整移植自原 icpc-workbench，去掉 DB 依赖）。
 * 包含：推荐题目引擎（按弱项分组）、AI 提示词构建、计划生成、模板降级。
 */

import type { PlatformId, TaskKind } from '../types.ts'
import type { IcpcStore, SubmissionRow } from '../store/index.ts'
import type { WeaknessProfile } from '../types.ts'
import { computeWeakness } from '../analysis/weakness.ts'
import { computeTrend } from '../analysis/trend.ts'
import { filterNoiseTags } from '../analysis/tags.ts'
import type { ProblemRecord } from '../store/schema.ts'

export const TASK_KINDS = ['practice', 'review', 'topic', 'contest'] as readonly string[]

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

export interface RecommendProblem {
  platform: PlatformId
  problemKey: string
  title: string
  difficulty: number | null
  tags: string[]
  url: string | null
  role?: 'weak' | 'review'
}

export interface WeakTagGroup {
  tag: string
  gap: number
  problems: RecommendProblem[]
}

export interface PlanPackage {
  profile: WeaknessProfile
  trend: ReturnType<typeof computeTrend>
  problems: RecommendProblem[]
  problemGroups: WeakTagGroup[]
  level: UserLevel
  prompt: string
  meta: { startDate: string; days: number; generatedAt: string }
}

// ---------- Prompt template ----------

const PROMPT_TEMPLATE = `你是一名 ICPC 备赛教练。基于以下用户的刷题数据，生成一份为期 {days} 天的个性化训练计划。

## 用户当前水平（JSON：已 AC 题难度分位与建议训练区间）
{level}

## 用户弱项画像（JSON）
{weakness}

## 近期提交趋势（JSON，按周）
{trend}

## 可推荐的题目清单（按弱项 tag 分组；每组含少量未 AC 新题与至多 1 道已 AC 复习题）
{problems}

## 输出要求
只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块标记。结构如下：
{
  "title": "计划标题（简短）",
  "goal": "训练目标（一段话，结合弱项）",
  "tasks": [
    {
      "date": "YYYY-MM-DD",
      "title": "任务标题",
      "kind": "practice | review | topic | contest",
      "platform": "codeforces | atcoder",
      "problemKey": "题目 key（不安排具体题可省略）",
      "url": "题目链接（可省略）",
      "note": "说明（如：重点练习的 tag、回顾要点）"
    }
  ]
}

## 约束
- 计划从 {startDate} 开始，共 {days} 天，每天 1-3 个任务
- 优先覆盖用户弱项标签（见弱项画像，gap 越大越弱）；题目清单已按弱项分组，新题（未 AC）为主，标注「已AC-可作复习」的题仅在 review 任务中少量安排
- 题目难度以「建议训练区间」（suggestedRange）为准：以区间中位为主，穿插少量上限题做挑战；不要安排远低于区间的水题
- practice/topic 任务必须从题目清单选题，并原样复制清单中的 problemKey 与 url；只有 review/contest 类泛任务可以不带题目
- 清单外选题时也必须给出可访问的题目链接
- 每 3-4 天安排一次 kind=review 的回顾任务
- 每周安排一次 kind=contest 的模拟比赛任务，url 给虚拟赛入口（如 https://codeforces.com/problemset?order=BY_SOLVED_DESC）
- task 里的 date 必须是计划期内（{startDate} 起 {days} 天）的具体日期`

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
}

// ---------- Date helpers ----------

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---------- User level ----------

export function computeUserLevel(rows: SubmissionRow[], minSample = 10): UserLevel {
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

// ---------- Recommendation engine ----------

/** 按弱项 tag 分组选题（完整移植自原 planService.recommendProblemsByWeakTag） */
export function recommendProblemsByWeakTag(
  store: IcpcStore,
  profile: WeaknessProfile,
  opts: {
    perTag?: number
    reviewPerTag?: number
    minNewProblems?: number
    level?: UserLevel | null
  } = {},
): WeakTagGroup[] {
  const perTag = opts.perTag ?? 5
  const reviewPerTag = opts.reviewPerTag ?? 1
  const minNew = opts.minNewProblems ?? 0
  const level = opts.level ?? computeUserLevel(store.getSubmissionRows())
  const acKeys = store.getAcKeys()

  interface Candidate extends RecommendProblem {
    lastAcAt: string | null
  }

  const toCandidate = (p: ProblemRecord): Candidate => {
    const key = `${p.platform}:${p.problemKey}`
    const isAc = acKeys.has(key)
    // 用索引查最后 AC 时间（O(1) 查找，不扫全量提交）
    let lastAcAt: string | null = null
    for (const s of store.getSubmissionsForProblem(p.platform, p.problemKey)) {
      if (s.verdict === 'AC' && (!lastAcAt || s.submittedAt > lastAcAt)) lastAcAt = s.submittedAt
    }
    return {
      platform: p.platform,
      problemKey: p.problemKey,
      title: p.title,
      difficulty: p.difficulty,
      tags: filterNoiseTags(p.tags),
      url: p.url,
      ...(isAc ? { role: 'review' as const } : { role: 'weak' as const }),
      lastAcAt,
    }
  }

  const weakTags = profile.items.map((i) => i.tag)
  const gapByTag = new Map(profile.items.map((i) => [i.tag, i.gap]))
  const [lo, hi] = level.suggestedRange ?? [null, null]
  const inRange = (d: number | null): boolean => {
    if (lo === null || hi === null) return true
    return d !== null && d >= lo && d <= hi
  }

  // 分组
  const groups = new Map<string, Candidate[]>()
  for (const tag of weakTags) groups.set(tag, [])
  const misc: Candidate[] = []
  const used = new Set<string>()
  for (const p of store.browseProblems({ bank: true, limit: 5000 })) {
    if (!p.url) continue
    const c = toCandidate(p)
    const key = `${c.platform}:${c.problemKey}`
    if (used.has(key)) continue
    const hit = c.tags.find((t) => groups.has(t))
    if (hit) {
      groups.get(hit)!.push(c)
      used.add(key)
    } else if (!c.tags.some((t) => weakTags.includes(t)) && !acKeys.has(key)) {
      misc.push(c)
      used.add(key)
    }
  }

  const orderedWeak = (list: Candidate[]): Candidate[] =>
    [...list].filter((c) => c.role === 'weak').sort((a, b) => {
      const aIn = inRange(a.difficulty) ? 0 : 1
      const bIn = inRange(b.difficulty) ? 0 : 1
      return aIn - bIn || (a.difficulty ?? 9999) - (b.difficulty ?? 9999)
    })

  const pickReview = (list: Candidate[]): Candidate[] =>
    [...list].filter((c) => c.role === 'review').sort((a, b) => (a.lastAcAt ?? '').localeCompare(b.lastAcAt ?? '')).slice(0, reviewPerTag)

  interface Picked { tag: string; gap: number; weak: Candidate[]; review: Candidate[]; rest: Candidate[] }
  const pickedList: Picked[] = []
  const consider = (tag: string, gap: number, list: Candidate[]): Picked | undefined => {
    const ordered = orderedWeak(list)
    const weak = ordered.filter((c) => inRange(c.difficulty)).slice(0, perTag)
    const rest = ordered.filter((c) => !weak.includes(c))
    const review = pickReview(list)
    if (weak.length + review.length === 0) return undefined
    const picked: Picked = { tag, gap, weak, review, rest }
    pickedList.push(picked)
    return picked
  }
  for (const [tag, list] of groups) consider(tag, gapByTag.get(tag) ?? 0, list)
  const miscPicked = consider('综合练习', 0, misc)

  // 补齐
  const weakGroups = [...pickedList].sort((a, b) => b.gap - a.gap)
  const refill = [...weakGroups, ...(miscPicked ? [miscPicked] : [])]
  const totalWeak = (): number => pickedList.reduce((n, p) => n + p.weak.length, 0)
  const takeRound = (inRangeOnly: boolean): void => {
    for (let i = 0; totalWeak() < minNew; i++) {
      const g = refill[i % refill.length]
      if (!g || refill.every((x) => !x.rest.some((c) => inRangeOnly === inRange(c.difficulty)))) break
      const idx = g.rest.findIndex((c) => inRangeOnly === inRange(c.difficulty))
      if (idx === -1) continue
      const [next] = g.rest.splice(idx, 1)
      g.weak.push(next)
    }
  }
  takeRound(true)
  takeRound(false)

  return pickedList.map((p) => ({ tag: p.tag, gap: p.gap, problems: [...p.weak, ...p.review] }))
}

/** 分组候选渲染为 Markdown 列表（AI 提示词用） */
export function renderProblemGroups(groups: WeakTagGroup[]): string {
  if (groups.length === 0) return '（暂无候选：题库为空或所有候选均已 AC，可自行安排平台选题）'
  const weakCount = groups.reduce((n, g) => n + g.problems.filter((p) => p.role !== 'review').length, 0)
  const reviewCount = groups.reduce((n, g) => n + g.problems.filter((p) => p.role === 'review').length, 0)
  const lines: string[] = [`（新题 ${weakCount} 道、已 AC 复习题 ${reviewCount} 道）`]
  for (const g of groups) {
    lines.push(`### ${g.tag}${g.gap > 0 ? `（弱项 gap=${g.gap}）` : ''}`)
    for (const p of g.problems) {
      const parts = [
        `- ${p.platform}/${p.problemKey}《${p.title}》`,
        p.difficulty !== null ? `难度${p.difficulty}` : '难度未知',
        p.role === 'review' ? '已AC-可作复习' : '未AC',
      ]
      if (p.url) parts.push(p.url)
      lines.push(parts.join(' | '))
    }
  }
  return lines.join('\n')
}

/** 构建供 AI 使用的数据包（含渲染后的提示词） */
export function buildPlanPackage(store: IcpcStore, opts: { days?: number; startDate?: string } = {}): PlanPackage {
  const days = opts.days ?? 14
  const startDate = opts.startDate ?? today()
  const rows = store.getSubmissionRows()
  const profile = computeWeakness(rows, { minAttempts: 5, topN: 8 })
  const trend = computeTrend(rows, 12)
  const level = computeUserLevel(rows)
  const problems = recommendProblemsByWeakTag(store, profile, {
    level,
    minNewProblems: days * 2,
  })

  const prompt = renderTemplate(PROMPT_TEMPLATE, {
    days: String(days),
    startDate,
    level: JSON.stringify(level),
    weakness: JSON.stringify(profile.items),
    trend: JSON.stringify(trend),
    problems: renderProblemGroups(problems),
  })

  return {
    profile, trend,
    problems: problems.flatMap((g) => g.problems),
    problemGroups: problems,
    level, prompt,
    meta: { startDate, days, generatedAt: new Date().toISOString() },
  }
}

// ---------- Plan JSON parsing ----------

export function parsePlanJson(raw: string, startDate: string, days: number): PlanInput {
  let text = raw.trim()
  if (text.includes('```')) text = text.replace(/```[a-zA-Z]*\s*/g, '').trim()
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
      kind: (TASK_KINDS as readonly string[]).includes(t.kind as string) ? (t.kind as string) : 'practice',
      platform: t.platform as PlatformId | undefined,
      problemKey: t.problemKey as string | undefined,
      url: t.url as string | undefined,
      note: t.note as string | undefined,
    }))
  if (tasks.length === 0) throw new Error('AI 输出 tasks 中没有有效任务')
  return { title: obj.title, goal: typeof obj.goal === 'string' ? obj.goal : '', startDate, days, tasks }
}

// ---------- Template plan (降级) ----------

/** 无 AI 时的降级模板：每日练习任务均挑选具体题目（可点击跳转） */
export function templatePlan(
  store: IcpcStore,
  profile: WeaknessProfile,
  startDate: string,
  days: number,
): PlanInput {
  const weakTags = profile.items.map((i) => i.tag)
  const tags = weakTags.length > 0 ? weakTags : ['综合练习']
  const pool = practicePool(store, weakTags)
  const queue = new Map<string, RecommendProblem[]>()
  for (const t of tags) {
    queue.set(t, t === '综合练习' ? [...pool] : pool.filter((p) => p.tags.includes(t)))
  }
  const fallbackPool = [...pool]
  const used = new Set<string>()
  const takeNext = (q: RecommendProblem[]): RecommendProblem | undefined => {
    while (q.length > 0) {
      const pb = q.shift()
      if (!pb) return undefined
      const key = `${pb.platform}:${pb.problemKey}`
      if (used.has(key)) continue
      used.add(key)
      return pb
    }
    return undefined
  }
  const takeAny = (): RecommendProblem | undefined => takeNext(fallbackPool)
  const CONTEST_URL = 'https://codeforces.com/problemset?order=BY_SOLVED_DESC'
  const REVIEW_URL = 'https://codeforces.com/submissions/me'
  const tasks: PlanTaskInput[] = []
  for (let d = 0; d < days; d += 1) {
    const date = addDays(startDate, d)
    if (d % 7 === 6) {
      tasks.push({ date, title: '模拟比赛（虚拟参赛）', kind: 'contest', url: CONTEST_URL, note: '完整 2 小时虚拟参赛，赛后补题' })
    } else {
      const tag = tags[d % tags.length]
      const pb = takeNext(queue.get(tag) ?? []) ?? takeAny()
      tasks.push(
        pb
          ? { date, title: pb.title, kind: 'practice', platform: pb.platform, problemKey: pb.problemKey, url: pb.url ?? undefined, note: `重点突破弱项：${tag}` }
          : { date, title: `练习：${tag}`, kind: 'practice', note: `重点突破弱项：${tag}` },
      )
    }
    if ((d + 1) % 4 === 0) {
      tasks.push({ date, title: `回顾与错题重做（前 ${Math.min(d + 1, 7)} 天）`, kind: 'review', url: REVIEW_URL })
    }
  }
  const goal = weakTags.length > 0
    ? `针对性突破弱项：${weakTags.slice(0, 3).join('、')}，保持每日练习节奏。`
    : '保持每日练习节奏，稳步提升。'
  return { title: `模板训练计划（${days} 天）`, goal, startDate, days, tasks }
}

/** 训练候选池：未 AC 且带链接的题，按弱项标签命中数排序 */
function practicePool(store: IcpcStore, weakTags: string[]): RecommendProblem[] {
  const level = computeUserLevel(store.getSubmissionRows())
  const [lo, hi] = level.suggestedRange ?? [null, null]
  const acKeys = store.getAcKeys()
  const rows = store.browseProblems({ bank: true, limit: 500 })
    .filter((p) => p.url !== null && !acKeys.has(`${p.platform}:${p.problemKey}`))
    .filter((p) => lo === null || hi === null || (p.difficulty !== null && p.difficulty >= lo && p.difficulty <= hi))
  const weak = new Set(weakTags)
  return rows
    .map((p) => ({
      platform: p.platform,
      problemKey: p.problemKey,
      title: p.title,
      difficulty: p.difficulty,
      tags: filterNoiseTags(p.tags),
      url: p.url,
      score: filterNoiseTags(p.tags).filter((t) => weak.has(t)).length,
    }))
    .sort((a, b) => b.score - a.score || (a.difficulty ?? 0) - (b.difficulty ?? 0))
}

// ---------- AI call ----------

async function callAi(cfg: { baseURL: string; apiKey: string; model: string }, prompt: string): Promise<string> {
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

// ---------- Plan generation ----------

export async function generatePlan(
  store: IcpcStore,
  aiConfig: { enabled: boolean; baseURL: string; apiKey: string; model: string },
  opts: { days?: number; startDate?: string } = {},
): Promise<{ planId: number; source: 'ai' | 'template'; title: string; degradedReason?: string }> {
  const days = opts.days ?? 14
  const startDate = opts.startDate ?? today()
  const pkg = buildPlanPackage(store, { days, startDate })

  if (aiConfig.enabled && aiConfig.apiKey.trim()) {
    try {
      const raw = await callAi(aiConfig, pkg.prompt)
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

  const profile = computeWeakness(store.getSubmissionRows(), { minAttempts: 5, topN: 8 })
  const tpl = templatePlan(store, profile, startDate, days)
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
      platform: t.platform,
      problemKey: t.problemKey,
      checked: false,
    })),
  })
  // 若 AI 已启用但失败，向调用方说明降级原因（区别于用户主动未配置 AI）
  const degradedReason = aiConfig.enabled && aiConfig.apiKey.trim() ? 'AI 生成失败，已降级为模板计划' : undefined
  return { planId: plan.id, source: 'template', title: tpl.title, degradedReason }
}
