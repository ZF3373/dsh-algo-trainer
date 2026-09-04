/**
 * JSON 存储引擎：内存索引 + 落盘（替代 SQLite）。
 *
 * 启动时从 workspace 目录加载 JSON 状态文件到内存，
 * 所有查询走内存 Map/Array（无 SQL），变更后防抖写盘。
 * 供分析引擎、工具层、RPC 共用——store 是唯一的数据入口。
 */

import type { FsService } from '../dsh-compat.ts'
import type { PlatformId, Verdict } from '../types.ts'
import type {
  ProblemRecord,
  SubmissionRecord,
  PlanRecord,
  PlanTaskRecord,
  ReviewRecord,
  TemplateProgressRecord,
  SettingsRecord,
  StoreState,
} from './schema.ts'
import { defaultState } from './schema.ts'

const STATE_FILE = 'icpc-state.json'
const SAVE_DEBOUNCE_MS = 500

/** join problems + submissions 后的行（供分析引擎用，等价于原 SQL fetchRows） */
export interface SubmissionRow {
  platform: PlatformId
  verdict: string
  submittedAt: string
  problemKey: string
  difficulty: number | null
  tags: string[]
}

export interface StatsFilter {
  from?: string
  to?: string
  platform?: PlatformId
}

export class IcpcStore {
  private state: StoreState = defaultState()
  private fs: FsService
  private dataDir: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private nextPlanId = 1
  private nextReviewId = 1
  private nextTaskId = 1

  constructor(fs: FsService, dataDir: string) {
    this.fs = fs
    this.dataDir = dataDir
  }

  /** 从磁盘加载状态（文件不存在时初始化空状态） */
  async load(): Promise<void> {
    try {
      const filePath = `${this.dataDir}/${STATE_FILE}`
      const exists = await this.fs.exists(filePath)
      if (exists) {
        const raw = await this.fs.readFile(filePath)
        this.state = { ...defaultState(), ...JSON.parse(raw) }
      }
    } catch (e) {
      console.warn(`[icpc-store] load failed, starting fresh: ${(e as Error).message}`)
    }
    // 重建自增 ID
    for (const p of this.state.plans) {
      if (p.id >= this.nextPlanId) this.nextPlanId = p.id + 1
      for (const t of p.tasks) {
        if (t.id >= this.nextTaskId) this.nextTaskId = t.id + 1
      }
    }
    for (const r of this.state.reviews) {
      if (r.id >= this.nextReviewId) this.nextReviewId = r.id + 1
    }
  }

  /** 防抖落盘 */
  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS)
  }

  /** 立即写盘（dispose 时调用） */
  async flush(): Promise<void> {
    try {
      await this.fs.mkdir(this.dataDir)
      await this.fs.writeFile(
        `${this.dataDir}/${STATE_FILE}`,
        JSON.stringify(this.state, null, 2),
      )
    } catch (e) {
      console.error(`[icpc-store] flush failed: ${(e as Error).message}`)
    }
  }

  // ---------- Settings ----------

  getSettings(): SettingsRecord {
    return this.state.settings
  }

  /** 库中已有的提交号集合（供适配器增量终止用） */
  getKnownExternalIds(platform?: PlatformId): Set<string> {
    return new Set(
      this.state.submissions
        .filter((s) => !platform || s.platform === platform)
        .map((s) => s.externalId),
    )
  }

  updateSettings(patch: Partial<SettingsRecord>): void {
    if (patch.handles) {
      this.state.settings.handles = { ...this.state.settings.handles, ...patch.handles }
    }
    if (patch.ai) {
      this.state.settings.ai = { ...this.state.settings.ai, ...patch.ai }
    }
    this.scheduleSave()
  }

  getHandle(platform: PlatformId): string | undefined {
    return this.state.settings.handles[platform]
  }

  // ---------- Problems ----------

  upsertProblem(p: ProblemRecord): void {
    const idx = this.state.problems.findIndex(
      (x) => x.platform === p.platform && x.problemKey === p.problemKey,
    )
    if (idx >= 0) {
      this.state.problems[idx] = {
        ...this.state.problems[idx],
        ...p,
        difficulty: p.difficulty ?? this.state.problems[idx].difficulty,
      }
    } else {
      this.state.problems.push(p)
    }
    this.scheduleSave()
  }

  findProblem(platform: PlatformId, problemKey: string): ProblemRecord | undefined {
    return this.state.problems.find(
      (p) => p.platform === platform && p.problemKey === problemKey,
    )
  }

  // ---------- Submissions ----------

  insertSubmissions(subs: SubmissionRecord[]): { imported: number; skipped: number } {
    const existing = new Set(this.state.submissions.map((s) => s.externalId))
    let imported = 0
    let skipped = 0
    for (const s of subs) {
      if (existing.has(s.externalId)) {
        skipped++
        continue
      }
      existing.add(s.externalId)
      this.state.submissions.push(s)
      // 同时 upsert problem
      this.upsertProblem({
        platform: s.platform,
        problemKey: s.problemKey,
        title: s.problemKey,
        difficulty: null,
        url: null,
        tags: [],
      })
      imported++
    }
    this.scheduleSave()
    return { imported, skipped }
  }

  /** 提交 + 题目 join（等价于 SQL fetchRows），供分析引擎用 */
  getSubmissionRows(filter: StatsFilter = {}): SubmissionRow[] {
    const problemMap = new Map(
      this.state.problems.map((p) => [`${p.platform}:${p.problemKey}`, p]),
    )
    return this.state.submissions
      .filter((s) => {
        if (filter.platform && s.platform !== filter.platform) return false
        if (filter.from && s.submittedAt < filter.from) return false
        if (filter.to && s.submittedAt > filter.to) return false
        return true
      })
      .map((s) => {
        const p = problemMap.get(`${s.platform}:${s.problemKey}`)
        return {
          platform: s.platform,
          verdict: s.verdict,
          submittedAt: s.submittedAt,
          problemKey: s.problemKey,
          difficulty: p?.difficulty ?? null,
          tags: p?.tags ?? [],
        }
      })
  }

  /** 已 AC 的题目 key 集合 */
  getAcKeys(): Set<string> {
    const set = new Set<string>()
    for (const s of this.state.submissions) {
      if (s.verdict === 'AC') set.add(`${s.platform}:${s.problemKey}`)
    }
    return set
  }

  /** 近期 AC 难度列表（按时间降序） */
  getRecentAcDifficulties(since: string): number[] {
    const acKeys = this.getAcKeys()
    const problemMap = new Map(
      this.state.problems.map((p) => [`${p.platform}:${p.problemKey}`, p]),
    )
    const diffs: number[] = []
    const seen = new Set<string>()
    for (const s of [...this.state.submissions].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))) {
      if (s.verdict !== 'AC' || s.submittedAt < since) continue
      const key = `${s.platform}:${s.problemKey}`
      if (seen.has(key)) continue
      seen.add(key)
      const p = problemMap.get(key)
      if (p?.difficulty != null) diffs.push(p.difficulty)
    }
    return diffs
  }

  /** 所有有难度、未 AC 的题（今日训练候选） */
  getUnsolvedCandidates(): Array<ProblemRecord & { id: number }> {
    const acKeys = this.getAcKeys()
    return this.state.problems
      .map((p, i) => ({ ...p, id: i + 1 }))
      .filter(
        (p) =>
          p.difficulty != null &&
          !acKeys.has(`${p.platform}:${p.problemKey}`),
      )
  }

  // ---------- Plans ----------

  createPlan(plan: Omit<PlanRecord, 'id' | 'createdAt'>): PlanRecord {
    const record: PlanRecord = {
      ...plan,
      id: this.nextPlanId++,
      createdAt: new Date().toISOString(),
    }
    for (const t of record.tasks) {
      t.id = this.nextTaskId++
    }
    this.state.plans.push(record)
    this.scheduleSave()
    return record
  }

  listPlans(): PlanRecord[] {
    return [...this.state.plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getPlan(id: number): PlanRecord | undefined {
    return this.state.plans.find((p) => p.id === id)
  }

  deletePlan(id: number): boolean {
    const idx = this.state.plans.findIndex((p) => p.id === id)
    if (idx < 0) return false
    this.state.plans.splice(idx, 1)
    this.scheduleSave()
    return true
  }

  findTask(taskId: number): { plan: PlanRecord; task: PlanTaskRecord } | undefined {
    for (const plan of this.state.plans) {
      const task = plan.tasks.find((t) => t.id === taskId)
      if (task) return { plan, task }
    }
    return undefined
  }

  updateTask(taskId: number, patch: Partial<PlanTaskRecord>): boolean {
    const found = this.findTask(taskId)
    if (!found) return false
    Object.assign(found.task, patch)
    this.scheduleSave()
    return true
  }

  deleteTask(taskId: number): boolean {
    for (const plan of this.state.plans) {
      const idx = plan.tasks.findIndex((t) => t.id === taskId)
      if (idx >= 0) {
        plan.tasks.splice(idx, 1)
        this.scheduleSave()
        return true
      }
    }
    return false
  }

  toggleCheckin(taskId: number, checked: boolean): void {
    const found = this.findTask(taskId)
    if (!found) return
    found.task.checked = checked
    this.scheduleSave()
  }

  /** 某天的任务列表 */
  getTasksByDate(date: string): PlanTaskRecord[] {
    const tasks: PlanTaskRecord[] = []
    for (const plan of this.state.plans) {
      for (const t of plan.tasks) {
        if (t.taskDate === date) tasks.push(t)
      }
    }
    return tasks
  }

  /** 月视图：某月每日任务数与打卡数 */
  getMonthView(month: string): Array<{ date: string; total: number; checked: number }> {
    const byDate = new Map<string, { total: number; checked: number }>()
    for (const plan of this.state.plans) {
      for (const t of plan.tasks) {
        if (t.taskDate.startsWith(month)) {
          const cur = byDate.get(t.taskDate) ?? { total: 0, checked: 0 }
          cur.total++
          if (t.checked) cur.checked++
          byDate.set(t.taskDate, cur)
        }
      }
    }
    return [...byDate.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** 连续打卡天数 */
  getStreak(todayStr: string): { current: number; longest: number; totalDays: number } {
    const dates = new Set<string>()
    for (const plan of this.state.plans) {
      for (const t of plan.tasks) {
        if (t.checked) dates.add(t.taskDate)
      }
    }
    if (dates.size === 0) return { current: 0, longest: 0, totalDays: 0 }
    const toDayNum = (s: string): number =>
      Number(new Date(`${s}T00:00:00Z`).getTime() / 86_400_000) | 0
    const days = [...dates].map(toDayNum).sort((a, b) => a - b)
    let longest = 1
    let run = 1
    for (let i = 1; i < days.length; i++) {
      run = days[i] - days[i - 1] === 1 ? run + 1 : 1
      if (run > longest) longest = run
    }
    const today = toDayNum(todayStr)
    const set = new Set(days)
    let cursor = set.has(today) ? today : today - 1
    let current = 0
    while (set.has(cursor)) {
      current++
      cursor--
    }
    return { current, longest, totalDays: days.length }
  }

  // ---------- Reviews ----------

  addReview(problem: ProblemRecord): ReviewRecord {
    const todayStr = new Date().toISOString().slice(0, 10)
    const existing = this.state.reviews.find(
      (r) => r.platform === problem.platform && r.problemKey === problem.problemKey,
    )
    if (existing) return existing
    const record: ReviewRecord = {
      id: this.nextReviewId++,
      platform: problem.platform,
      problemKey: problem.problemKey,
      title: problem.title,
      difficulty: problem.difficulty,
      url: problem.url,
      tags: problem.tags,
      stage: 0,
      note: null,
      nextDueOn: todayStr,
      lastReviewedAt: null,
      addedAt: new Date().toISOString(),
    }
    this.state.reviews.push(record)
    this.scheduleSave()
    return record
  }

  listReviews(dueOnly = false): ReviewRecord[] {
    const todayStr = new Date().toISOString().slice(0, 10)
    return [...this.state.reviews]
      .filter((r) => !dueOnly || r.nextDueOn <= todayStr)
      .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))
  }

  getReview(id: number): ReviewRecord | undefined {
    return this.state.reviews.find((r) => r.id === id)
  }

  updateReview(id: number, patch: Partial<ReviewRecord>): boolean {
    const r = this.getReview(id)
    if (!r) return false
    Object.assign(r, patch)
    this.scheduleSave()
    return true
  }

  deleteReview(id: number): boolean {
    const idx = this.state.reviews.findIndex((r) => r.id === id)
    if (idx < 0) return false
    this.state.reviews.splice(idx, 1)
    this.scheduleSave()
    return true
  }

  getDueCount(): number {
    const todayStr = new Date().toISOString().slice(0, 10)
    return this.state.reviews.filter((r) => r.nextDueOn <= todayStr).length
  }

  // ---------- Template Progress ----------

  getTemplateProgress(templateId: string): TemplateProgressRecord | undefined {
    return this.state.templateProgress.find((t) => t.templateId === templateId)
  }

  setTemplateProgress(templateId: string, patch: Partial<TemplateProgressRecord>): void {
    const existing = this.getTemplateProgress(templateId)
    if (existing) {
      Object.assign(existing, patch)
    } else {
      this.state.templateProgress.push({
        templateId,
        status: 'todo',
        note: null,
        ...patch,
      })
    }
    this.scheduleSave()
  }

  getAllProgress(): Map<string, TemplateProgressRecord> {
    return new Map(this.state.templateProgress.map((t) => [t.templateId, t]))
  }
}
