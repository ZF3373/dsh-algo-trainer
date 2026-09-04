/**
 * Codeforces 适配器：官方公开 API（无需登录）。
 * - user.status: 提交记录（支持 knownExternalIds 增量终止）
 * - contest.list: 赛事列表
 * 移植自原 icpc-workbench，去掉 node:fs 依赖，纯 fetch。
 */

import type { NormalizedSubmission, PlatformId, Verdict } from '../types.ts'
import type { PlatformAdapter, ContestAdapter } from './types.ts'

const API_BASE = 'https://codeforces.com/api'
const PAGE_SIZE = 1000

interface CFProblem {
  contestId?: number
  index: string
  name: string
  rating?: number
  tags?: string[]
}

interface CFSubmission {
  id: number
  contestId?: number
  problem: CFProblem
  verdict?: string
  programmingLanguage?: string
  creationTimeSeconds: number
}

interface CFResponse {
  status: string
  comment?: string
  result?: CFSubmission[]
}

const VERDICT_MAP: Record<string, Verdict> = {
  OK: 'AC',
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  RUNTIME_ERROR: 'RE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  COMPILATION_ERROR: 'CE',
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function splitKey(key: string): { contestId?: string; index: string } {
  const m = /^(\d+)(.+)$/.exec(key)
  return m ? { contestId: m[1], index: m[2] } : { index: key }
}

function problemUrlFor(contestId: number | undefined, index: string): string {
  if (contestId === undefined) return `https://codeforces.com/problemset/problem/${index}`
  const base = contestId >= 100000 ? 'gym' : 'contest'
  return `https://codeforces.com/${base}/${contestId}/problem/${index}`
}

function normalize(s: CFSubmission): NormalizedSubmission {
  const { contestId, index } = s.problem
  const key = contestId !== undefined ? `${contestId}${index}` : index
  return {
    problem: {
      platform: 'codeforces' as PlatformId,
      problemKey: key,
      title: s.problem.name,
      ...(s.problem.rating !== undefined ? { difficulty: s.problem.rating } : {}),
      url: problemUrlFor(contestId, index),
      tags: s.problem.tags ?? [],
    },
    verdict: s.verdict ? (VERDICT_MAP[s.verdict] ?? 'SKIPPED') : 'SKIPPED',
    ...(s.programmingLanguage ? { language: s.programmingLanguage } : {}),
    submittedAt: new Date(s.creationTimeSeconds * 1000).toISOString(),
    externalId: String(s.id),
  }
}

export function createCodeforcesAdapter(
  fetchFn: typeof fetch = fetch,
): PlatformAdapter & ContestAdapter {
  return {
    platform: 'codeforces',
    knownIdsFilter: true,

    async fetchUserSubmissions(handle, opts) {
      const known = opts?.knownExternalIds
      const out: NormalizedSubmission[] = []
      let from = 1
      for (;;) {
        const url = `${API_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${PAGE_SIZE}`
        const res = await fetchFn(url, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) throw new Error(`Codeforces API HTTP ${res.status}`)
        const data = (await res.json()) as CFResponse
        if (data.status !== 'OK') throw new Error(`Codeforces API: ${data.comment ?? 'unknown error'}`)
        const page = data.result ?? []
        let unknownInPage = 0
        for (const s of page) {
          if (known?.has(String(s.id))) continue
          unknownInPage += 1
          out.push(normalize(s))
        }
        if (page.length < PAGE_SIZE) break
        if (known && unknownInPage === 0) break
        from += PAGE_SIZE
        await sleep(500)
      }
      return out
    },

    problemUrl(problemKey) {
      const { contestId, index } = splitKey(String(problemKey))
      if (!contestId) return `https://codeforces.com/problemset/problem/${String(problemKey)}`
      const base = Number(contestId) >= 100000 ? 'gym' : 'contest'
      return `https://codeforces.com/${base}/${contestId}/problem/${index}`
    },

    async fetchContests() {
      const res = await fetchFn(`${API_BASE}/contest.list`, {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Codeforces contest.list HTTP ${res.status}`)
      const data = (await res.json()) as {
        status: string
        result?: Array<{
          id: number
          name: string
          type: string
          startTimeSeconds: number
          durationSeconds: number
          rel: string
        }>
      }
      if (data.status !== 'OK') return []
      return (data.result ?? []).map((c) => ({
        id: `cf-${c.id}`,
        platform: 'codeforces' as PlatformId,
        name: c.name,
        category: c.type === 'CF' ? 'Div.2/3' : c.type,
        startTimeIso: new Date(c.startTimeSeconds * 1000).toISOString(),
        durationMinutes: Math.round(c.durationSeconds / 60),
        phase: c.rel,
        url: `https://codeforces.com/contest/${c.id}`,
      }))
    },
  }
}
