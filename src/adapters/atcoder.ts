/**
 * AtCoder 适配器：kenkoooo.com 公开 API（无需登录）。
 * - user/submissions: 提交记录（from_second 增量）
 * - resources/problems.json + problem-models.json: 题目标题与难度
 * 移植自原 icpc-workbench，去掉 node:fs 磁盘缓存，改用内存 Map 缓存。
 */

import type { NormalizedSubmission, PlatformId, Verdict } from '../types.ts'
import type { PlatformAdapter, ContestAdapter } from './types.ts'

const API = 'https://kenkoooo.com/atcoder'
const SUBMISSION_PAGE = 500
const MAX_PAGES = 100

const RESULT_MAP: Record<string, Verdict> = {
  AC: 'AC',
  WA: 'WA',
  TLE: 'TLE',
  MLE: 'MLE',
  RE: 'RE',
  CE: 'CE',
  OLE: 'RE',
  IE: 'RE',
  WJ: 'SKIPPED',
  WR: 'SKIPPED',
  JUDGE: 'SKIPPED',
}

interface KenkoooSubmission {
  id: number
  epoch_second: number
  problem_id: string
  contest_id: string
  user_id: string
  language: string
  result: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function createAtcoderAdapter(
  fetchFn: typeof fetch = fetch,
): PlatformAdapter & ContestAdapter {
  let problems: Map<string, { title?: string }> | null = null
  let models: Map<string, { difficulty?: number | null }> | null = null

  async function ensureMaps(): Promise<void> {
    if (problems && models) return
    const [probRes, modelRes] = await Promise.all([
      fetchFn(`${API}/resources/problems.json`, { signal: AbortSignal.timeout(20000) }),
      fetchFn(`${API}/resources/problem-models.json`, { signal: AbortSignal.timeout(20000) }),
    ])
    if (!probRes.ok || !modelRes.ok) throw new Error('AtCoder resources fetch failed')
    const probData = (await probRes.json()) as { id: string; title?: string }[]
    const modelData = (await modelRes.json()) as Record<string, { difficulty?: number | null }>
    problems = new Map(probData.map((p) => [p.id, p]))
    models = new Map(Object.entries(modelData))
  }

  function normalize(
    s: KenkoooSubmission,
    probs: Map<string, { title?: string }>,
    mods: Map<string, { difficulty?: number | null }>,
  ): NormalizedSubmission {
    const title = probs.get(s.problem_id)?.title ?? s.problem_id
    const difficulty = mods.get(s.problem_id)?.difficulty ?? undefined
    return {
      problem: {
        platform: 'atcoder' as PlatformId,
        problemKey: s.problem_id,
        title,
        ...(typeof difficulty === 'number' && Number.isFinite(difficulty)
          ? { difficulty }
          : {}),
        url: `https://atcoder.jp/contests/${s.contest_id}/tasks/${s.problem_id}`,
        tags: [],
      },
      verdict: RESULT_MAP[s.result] ?? 'SKIPPED',
      language: s.language,
      submittedAt: new Date(s.epoch_second * 1000).toISOString(),
      externalId: String(s.id),
    }
  }

  return {
    platform: 'atcoder',

    async fetchUserSubmissions(handle, opts) {
      const since = opts?.since ? Math.floor(Date.parse(opts.since) / 1000) : 0
      const seen = new Set<string>()
      const raws: KenkoooSubmission[] = []
      let fromSecond = since

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${API}/atcoder-api/v3/user/submissions?user=${encodeURIComponent(handle)}&from_second=${fromSecond}`
        const res = await fetchFn(url, { signal: AbortSignal.timeout(20000) })
        if (!res.ok) throw new Error(`AtCoder API HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (!Array.isArray(data)) {
          const msg = (data as { message?: string }).message ?? 'unknown error'
          throw new Error(`AtCoder API: ${msg}`)
        }
        const rows = data as KenkoooSubmission[]
        if (rows.length === 0) break

        let added = 0
        let maxSecond = 0
        for (const s of rows) {
          if (seen.has(String(s.id))) continue
          seen.add(String(s.id))
          raws.push(s)
          added += 1
          if (s.epoch_second > maxSecond) maxSecond = s.epoch_second
        }
        if (rows.length < SUBMISSION_PAGE || added === 0) break
        fromSecond = maxSecond
        await sleep(1000)
      }

      if (raws.length === 0) return []
      await ensureMaps()
      return raws.map((s) =>
        normalize(s, problems ?? new Map(), models ?? new Map()),
      )
    },

    problemUrl(problemKey) {
      return `https://atcoder.jp/tasks/${String(problemKey)}`
    },

    async fetchContests() {
      const res = await fetchFn(`${API}/resources/contests.json`, {
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) throw new Error(`AtCoder contests HTTP ${res.status}`)
      const data = (await res.json()) as Array<{
        id: string
        title: string
        start_epoch_second: number
        duration_second: number
      }>
      return data.map((c) => ({
        id: `at-${c.id}`,
        platform: 'atcoder' as PlatformId,
        name: c.title,
        category: c.id.startsWith('abc') ? 'ABC'
          : c.id.startsWith('arc') ? 'ARC'
          : c.id.startsWith('agc') ? 'AGC'
          : 'Other',
        startTimeIso: new Date(c.start_epoch_second * 1000).toISOString(),
        durationMinutes: Math.round(c.duration_second / 60),
        phase: '',
        url: `https://atcoder.jp/contests/${c.id}`,
      }))
    },
  }
}
