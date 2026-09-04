/**
 * JSON 存储引擎：内存索引 + 落盘（替代 SQLite）。
 * 所有查询走内存 Map/Array，变更后防抖写盘。
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
  CustomTemplateRecord,
  SettingsRecord,
  StoreState,
} from './schema.ts'
import { defaultState } from './schema.ts'

const STATE_FILE = 'icpc-state.json'
const SAVE_DEBOUNCE_MS = 500

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
  private nextCustomId = 1

  constructor(fs: FsService, dataDir: string) {
    this.fs = fs
    this.dataDir = dataDir
  }

  async load(): Promise<void> {
    try {
      const filePath = `${this.dataDir}/${STATE_FILE}`
      const exists = await this.fs.exists(filePath)
      if (exists) {
        const raw = await this.fs.readFile(filePath)
        this.state = { ...defaultState(), ...JSON.parse(raw) }
        // 向前兼容：确保新字段存在
        if (!this.state.customTemplates) this.state.customTemplates = []
        if (!this.state.settings.adapterEnabled) this.state.settings.adapterEnabled = {}
        if (!this.state.settings.cookies) this.state.settings.cookies = {}
        if (!this.state.settings.reminder) this.state.settings.reminder = { enabled: false, time: '20:00' }
        if (!this.state.settings.accounts) this.state.settings.accounts = {}
      }
    } catch (e) {
      console.warn(`[icpc-store] load failed, starting fresh: ${(e as Error).message}`)
    }
    for (const p of this.state.plans) {
      if (p.id >= this.nextPlanId) this.nextPlanId = p.id + 1
      for (const t of p.tasks) {
        if (t.id >= this.nextTaskId) this.nextTaskId = t.id + 1
      }
    }
    for (const r of this.state.reviews) {
      if (r.id >= this.nextReviewId) this.nextReviewId = r.id + 1
    }
    for (const c of this.state.customTemplates) {
      if (c.id >= this.nextCustomId) this.nextCustomId = c.id + 1
    }
  }

  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS)
  }

  async flush(): Promise<void> {
    try {
      await this.fs.mkdir(this.dataDir)
      await this.fs.writeFile(`${this.dataDir}/${STATE_FILE}`, JSON.stringify(this.state, null, 2))
    } catch (e) {
      console.error(`[icpc-store] flush failed: ${(e as Error).message}`)
    }
  }

  // ---------- Settings ----------

  getSettings(): SettingsRecord {
    return this.state.settings
  }

  updateSettings(patch: Partial<SettingsRecord>): void {
    if (patch.ai) this.state.settings.ai = { ...this.state.settings.ai, ...patch.ai }
    if (patch.adapterEnabled) this.state.settings.adapterEnabled = { ...this.state.settings.adapterEnabled, ...patch.adapterEnabled }
    if (patch.cookies) this.state.settings.cookies = { ...this.state.settings.cookies, ...patch.cookies }
    if (patch.reminder) this.state.settings.reminder = { ...this.state.settings.reminder, ...patch.reminder }
    this.scheduleSave()
  }

  getHandle(platform: PlatformId): string | undefined {
    return this.state.settings.accounts[platform]?.handle
  }

  getAccount(platform: PlatformId): { handle: string; lastSyncAt: string | null; enabled: boolean } | undefined {
    const a = this.state.settings.accounts[platform]
    return a ? { handle: a.handle, lastSyncAt: a.lastSyncAt, enabled: a.enabled } : undefined
  }

  setAccount(platform: PlatformId, handle: string): void {
    const existing = this.state.settings.accounts[platform]
    this.state.settings.accounts[platform] = {
      platform, handle,
      // 换 handle 时重置 lastSyncAt（下次同步全量重拉）
      lastSyncAt: existing && existing.handle === handle ? existing.lastSyncAt : null,
      enabled: true,
    }
    this.scheduleSave()
  }

  setAccountSyncTime(platform: PlatformId, time: string): void {
    const a = this.state.settings.accounts[platform]
    if (a) { a.lastSyncAt = time; this.scheduleSave() }
  }

  setAdapterEnabled(platform: PlatformId, enabled: boolean): void {
    this.state.settings.adapterEnabled[platform] = enabled
    this.scheduleSave()
  }

  getAdapterEnabled(platform: PlatformId): boolean {
    return this.state.settings.adapterEnabled[platform] !== false
  }

  setCookie(platform: PlatformId, cookie?: string, csrf?: string): void {
    if (!this.state.settings.cookies[platform]) this.state.settings.cookies[platform] = {}
    if (cookie !== undefined) {
      if (cookie === '') delete this.state.settings.cookies[platform]!.cookie
      else this.state.settings.cookies[platform]!.cookie = cookie
    }
    if (csrf !== undefined) {
      if (csrf === '') delete this.state.settings.cookies[platform]!.csrf
      else this.state.settings.cookies[platform]!.csrf = csrf
    }
    // 清理空对象
    if (this.state.settings.cookies[platform] && Object.keys(this.state.settings.cookies[platform]!).length === 0) {
      delete this.state.settings.cookies[platform]
    }
    this.scheduleSave()
  }

  getCookie(platform: PlatformId): { cookie?: string; csrf?: string } | undefined {
    return this.state.settings.cookies[platform]
  }

  setReminder(enabled?: boolean, time?: string): void {
    if (enabled !== undefined) this.state.settings.reminder.enabled = enabled
    if (time !== undefined) this.state.settings.reminder.time = time
    this.scheduleSave()
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

  /** 批量 upsert 题库题（不产生提交），difficulty 保留已有值（COALESCE），tags 仅非空时覆盖 */
  upsertBankProblems(rows: ProblemRecord[]): Array<{ platform: PlatformId; inserted: number; updated: number }> {
    const byPlatform = new Map<PlatformId, ProblemRecord[]>()
    for (const r of rows) {
      const list = byPlatform.get(r.platform) ?? []
      list.push(r)
      byPlatform.set(r.platform, list)
    }
    const result: Array<{ platform: PlatformId; inserted: number; updated: number }> = []
    for (const [platform, items] of byPlatform) {
      let existed = 0
      for (const r of items) {
        const existing = this.findProblem(platform, r.problemKey)
        if (existing) {
          existed++
          this.upsertProblem({
            ...existing,
            title: r.title || existing.title,
            difficulty: existing.difficulty ?? r.difficulty,
            url: r.url ?? existing.url,
            tags: r.tags.length > 0 ? r.tags : existing.tags,
          })
        } else {
          this.state.problems.push(r)
        }
      }
      const uniqueKeys = new Set(items.map((r) => r.problemKey)).size
      const inserted = Math.max(0, uniqueKeys - existed)
      result.push({ platform, inserted, updated: uniqueKeys - inserted })
    }
    this.scheduleSave()
    return result
  }

  findProblem(platform: PlatformId, problemKey: string): ProblemRecord | undefined {
    return this.state.problems.find(
      (p) => p.platform === platform && p.problemKey === problemKey,
    )
  }

  /** 浏览题目：支持 platform/difficulty/tag/q 关键词过滤，bank=1 包含未做题 */
  browseProblems(opts: {
    platform?: PlatformId
    difficulty?: string
    tag?: string
    q?: string
    bank?: boolean
    limit?: number
  } = {}): Array<ProblemRecord & { attempts: number; acCount: number; lastAcAt: string | null; status: string }> {
    const acKeys = this.getAcKeys()
    const limit = opts.limit ?? 300
    let rows = this.state.problems
      .map((p) => {
        const subs = this.state.submissions.filter(
          (s) => s.platform === p.platform && s.problemKey === p.problemKey,
        )
        const acCount = subs.filter((s) => s.verdict === 'AC').length
        const lastAcAt = subs.filter((s) => s.verdict === 'AC').map((s) => s.submittedAt).sort().pop() ?? null
        return {
          ...p,
          attempts: subs.length,
          acCount,
          lastAcAt,
          status: acCount > 0 ? 'ac' : subs.length > 0 ? 'tried' : 'none',
        }
      })
    if (!opts.bank) {
      rows = rows.filter((r) => r.attempts > 0)
    }
    if (opts.platform) {
      rows = rows.filter((r) => r.platform === opts.platform)
    }
    if (opts.q && opts.q.trim()) {
      const q = opts.q.trim()
      rows = rows.filter((r) => r.title.includes(q) || r.problemKey.includes(q))
    }
    rows = rows.sort((a, b) => (b.difficulty ?? -1) - (a.difficulty ?? -1))
    if (opts.difficulty) {
      rows = rows.filter((r) => bucketForDifficulty(r.difficulty) === opts.difficulty)
    }
    if (opts.tag) {
      rows = rows.filter((r) => r.tags.includes(opts.tag!))
    }
    return rows.slice(0, limit)
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

  getKnownExternalIds(platform?: PlatformId): Set<string> {
    return new Set(
      this.state.submissions
        .filter((s) => !platform || s.platform === platform)
        .map((s) => s.externalId),
    )
  }

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

  getAcKeys(): Set<string> {
    const set = new Set<string>()
    for (const s of this.state.submissions) {
      if (s.verdict === 'AC') set.add(`${s.platform}:${s.problemKey}`)
    }
    return set
  }

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

  getTasksByDate(date: string): PlanTaskRecord[] {
    const tasks: PlanTaskRecord[] = []
    for (const plan of this.state.plans) {
      for (const t of plan.tasks) {
        if (t.taskDate === date) tasks.push(t)
      }
    }
    return tasks
  }

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
    return [...byDate.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date))
  }

  getStreak(todayStr: string): { current: number; longest: number; totalDays: number } {
    const dates = new Set<string>()
    for (const plan of this.state.plans) {
      for (const t of plan.tasks) {
        if (t.checked) dates.add(t.taskDate)
      }
    }
    if (dates.size === 0) return { current: 0, longest: 0, totalDays: 0 }
    const toDayNum = (s: string): number => Number(new Date(`${s}T00:00:00Z`).getTime() / 86_400_000) | 0
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
    while (set.has(cursor)) { current++; cursor-- }
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
        code: null,
        idea: null,
        complexity: null,
        url: null,
        masteredAt: null,
        ...patch,
      })
    }
    this.scheduleSave()
  }

  getAllProgress(): Map<string, TemplateProgressRecord> {
    return new Map(this.state.templateProgress.map((t) => [t.templateId, t]))
  }

  // ---------- Custom Templates ----------

  createCustomTemplate(input: Omit<CustomTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): CustomTemplateRecord {
    const record: CustomTemplateRecord = {
      ...input,
      id: this.nextCustomId++,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    }
    this.state.customTemplates.push(record)
    this.scheduleSave()
    return record
  }

  getCustomTemplate(id: number): CustomTemplateRecord | undefined {
    return this.state.customTemplates.find((c) => c.id === id)
  }

  updateCustomTemplate(id: number, patch: Partial<CustomTemplateRecord>): boolean {
    const c = this.getCustomTemplate(id)
    if (!c) return false
    Object.assign(c, patch)
    c.updatedAt = new Date().toISOString()
    this.scheduleSave()
    return true
  }

  deleteCustomTemplate(id: number): boolean {
    const idx = this.state.customTemplates.findIndex((c) => c.id === id)
    if (idx < 0) return false
    this.state.customTemplates.splice(idx, 1)
    // 清理学习进度
    this.state.templateProgress = this.state.templateProgress.filter(
      (t) => t.templateId !== `c-${id}`,
    )
    this.scheduleSave()
    return true
  }

  listCustomTemplates(): CustomTemplateRecord[] {
    return [...this.state.customTemplates].sort((a, b) => a.id - b.id)
  }

  /** 例题练习状态：是否已入库、是否已 AC */
  loadExampleStatus(pairs: Array<{ platform: string; key: string }>): Map<string, { inBank: boolean; ac: boolean }> {
    const acKeys = this.getAcKeys()
    const problemKeys = new Set(this.state.problems.map((p) => `${p.platform}:${p.problemKey}`))
    const map = new Map<string, { inBank: boolean; ac: boolean }>()
    for (const { platform, key } of pairs) {
      const k = `${platform}:${key}`
      map.set(k, {
        inBank: problemKeys.has(k),
        ac: acKeys.has(k),
      })
    }
    return map
  }
}

// ---------- Helpers (also used by analysis) ----------

export function bucketForDifficulty(difficulty: number | null | undefined): string {
  if (difficulty === null || difficulty === undefined || !Number.isFinite(difficulty)) return '未知'
  const bounds = [1200, 1400, 1600, 1900, 2200]
  const labels = ['<1200', '1200-1399', '1400-1599', '1600-1899', '1900-2199', '2200+']
  for (let i = 0; i < bounds.length; i++) {
    if (difficulty < bounds[i]) return labels[i]
  }
  return labels[labels.length - 1]
}
