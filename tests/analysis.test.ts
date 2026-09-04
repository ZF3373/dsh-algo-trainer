import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SubmissionRow } from '../src/store/index.ts'
import { computeOverall, bucketForDifficulty, rate } from '../src/analysis/stats.ts'
import { computeWeakness } from '../src/analysis/weakness.ts'
import { getWeekKey, computeTrend } from '../src/analysis/trend.ts'
import { filterNoiseTags, isNoiseTag } from '../src/analysis/tags.ts'
import { estimateLevel, bandRanges, pickBand, type CandidateProblem } from '../src/analysis/today.ts'
import { scheduleNext, nextStage, intervalDaysForStage, MAX_STAGE } from '../src/reviews/schedule.ts'
import { parsePlanJson } from '../src/plans/planService.ts'

function row(platform: string, verdict: string, submittedAt: string, problemKey: string, difficulty: number | null, tags: string[] = []): SubmissionRow {
  return { platform: platform as never, verdict, submittedAt, problemKey, difficulty, tags }
}

describe('bucketForDifficulty', () => {
  it('maps difficulty to correct bucket', () => {
    assert.equal(bucketForDifficulty(null), '未知')
    assert.equal(bucketForDifficulty(1100), '<1200')
    assert.equal(bucketForDifficulty(1200), '1200-1399')
    assert.equal(bucketForDifficulty(1399), '1200-1399')
    assert.equal(bucketForDifficulty(1600), '1600-1899')
    assert.equal(bucketForDifficulty(2200), '2200+')
  })
})

describe('rate', () => {
  it('calculates AC rate', () => {
    assert.equal(rate(0, 0), 0)
    assert.equal(rate(10, 5), 50)
    assert.equal(rate(3, 1), 33.3)
  })
})

describe('computeOverall', () => {
  it('computes basic stats', () => {
    const rows = [
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '100A', 1200, ['dp']),
      row('codeforces', 'WA', '2026-01-02T00:00:00Z', '100B', 1400, ['greedy']),
      row('atcoder', 'AC', '2026-01-03T00:00:00Z', 'abc100_a', 800, []),
    ]
    const stats = computeOverall(rows)
    assert.equal(stats.attempts, 3)
    assert.equal(stats.ac, 2)
    assert.equal(stats.acRate, 66.7)
    assert.equal(stats.solvedProblems, 2)
    assert.equal(stats.byPlatform.length, 2)
    assert.equal(stats.byPlatform[0].platform, 'codeforces')
    assert.equal(stats.byPlatform[0].attempts, 2)
  })

  it('respects platform filter', () => {
    const rows = [
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '100A', 1200),
      row('atcoder', 'AC', '2026-01-02T00:00:00Z', 'abc100_a', 800),
    ]
    const stats = computeOverall(rows, { platform: 'codeforces' })
    assert.equal(stats.attempts, 1)
  })
})

describe('computeWeakness', () => {
  it('identifies weak tags with positive gap', () => {
    const rows = [
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '1A', 1200, ['dp']),
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '2A', 1200, ['dp']),
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '3A', 1200, ['dp']),
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '4A', 1200, ['dp']),
      row('codeforces', 'AC', '2026-01-01T00:00:00Z', '5A', 1200, ['dp']),
      row('codeforces', 'WA', '2026-01-01T00:00:00Z', '6A', 1400, ['graph']),
      row('codeforces', 'WA', '2026-01-01T00:00:00Z', '7A', 1400, ['graph']),
      row('codeforces', 'WA', '2026-01-01T00:00:00Z', '8A', 1400, ['graph']),
      row('codeforces', 'WA', '2026-01-01T00:00:00Z', '9A', 1400, ['graph']),
      row('codeforces', 'WA', '2026-01-01T00:00:00Z', '10A', 1400, ['graph']),
    ]
    const profile = computeWeakness(rows, { minAttempts: 5, topN: 10 })
    assert.equal(profile.items.length, 2)
    const graphItem = profile.items.find((i) => i.tag === 'graph')
    assert.ok(graphItem)
    assert.ok(graphItem!.gap > 0)
    const dpItem = profile.items.find((i) => i.tag === 'dp')
    assert.ok(dpItem)
    assert.ok(dpItem!.gap <= 0)
  })
})

describe('getWeekKey', () => {
  it('produces ISO week key', () => {
    assert.match(getWeekKey(new Date('2026-08-19T00:00:00Z')), /^\d{4}-W\d{2}$/)
  })
})

describe('computeTrend', () => {
  it('returns N points with empty weeks filled', () => {
    const rows = [row('codeforces', 'AC', '2026-08-19T00:00:00Z', '1A', 1200)]
    const trend = computeTrend(rows, 4, new Date('2026-08-20T00:00:00Z'))
    assert.equal(trend.length, 4)
  })
})

describe('filterNoiseTags', () => {
  it('filters year and contest source tags', () => {
    assert.deepEqual(
      filterNoiseTags(['dp', '2026', 'NOIP', 'greedy', '*special']),
      ['dp', 'greedy'],
    )
  })
  it('isNoiseTag detects noise', () => {
    assert.ok(isNoiseTag('2026'))
    assert.ok(isNoiseTag('*special'))
    assert.ok(isNoiseTag('NOIP 2026'))
    assert.ok(!isNoiseTag('dp'))
    assert.ok(!isNoiseTag('greedy'))
  })
})

describe('estimateLevel', () => {
  it('returns fallback for empty input', () => {
    assert.equal(estimateLevel([]), 1200)
  })
  it('rounds median to nearest hundred', () => {
    assert.equal(estimateLevel([1300, 1500, 1700]), 1500)
    assert.equal(estimateLevel([1200, 1300, 1400, 1500]), 1400)
  })
})

describe('bandRanges', () => {
  it('produces three non-overlapping bands', () => {
    const r = bandRanges(1500)
    assert.equal(r.consolidation.max, 1499)
    assert.equal(r.core.min, 1500)
    assert.equal(r.core.max, 1700)
    assert.equal(r.challenge.min, 1701)
  })
})

describe('pickBand', () => {
  it('selects problems within band range', () => {
    const candidates: CandidateProblem[] = [
      { id: 1, platform: 'codeforces', problemKey: '1A', title: 'A', difficulty: 1300, url: 'x', tags: ['dp'] },
      { id: 2, platform: 'codeforces', problemKey: '2A', title: 'B', difficulty: 1600, url: 'x', tags: [] },
      { id: 3, platform: 'codeforces', problemKey: '3A', title: 'C', difficulty: 1800, url: 'x', tags: [] },
    ]
    const bands = bandRanges(1500)
    const result = pickBand(candidates, bands.core, 2, ['dp'], new Set(), 0)
    assert.equal(result.problems.length, 1) // only 1600 is in core [1500, 1700]
    assert.equal(result.problems[0].id, 2)
  })
  it('prioritizes weak tag matches', () => {
    const candidates: CandidateProblem[] = [
      { id: 1, platform: 'codeforces', problemKey: '1A', title: 'A', difficulty: 1300, url: 'x', tags: [] },
      { id: 2, platform: 'codeforces', problemKey: '2A', title: 'B', difficulty: 1300, url: 'x', tags: ['dp'] },
    ]
    const bands = bandRanges(1500)
    const result = pickBand(candidates, bands.consolidation, 1, ['dp'], new Set(), 0)
    assert.equal(result.problems[0].id, 2) // weak-tagged one first
    assert.deepEqual(result.problems[0].weakTags, ['dp'])
  })
})

describe('scheduleNext', () => {
  it('hard resets to stage 0', () => {
    const r = scheduleNext(3, 'hard', '2026-01-01')
    assert.equal(r.stage, 0)
    assert.equal(r.nextDueOn, '2026-01-02')
  })
  it('ok advances one stage', () => {
    const r = scheduleNext(0, 'ok', '2026-01-01')
    assert.equal(r.stage, 1)
    assert.equal(r.nextDueOn, '2026-01-04') // 3 days
  })
  it('easy advances two stages', () => {
    const r = scheduleNext(0, 'easy', '2026-01-01')
    assert.equal(r.stage, 2)
    assert.equal(r.nextDueOn, '2026-01-08') // 7 days
  })
  it('caps at MAX_STAGE', () => {
    assert.equal(nextStage(MAX_STAGE, 'easy'), MAX_STAGE)
    assert.equal(nextStage(MAX_STAGE, 'ok'), MAX_STAGE)
  })
})

describe('intervalDaysForStage', () => {
  it('returns correct interval for each stage', () => {
    assert.equal(intervalDaysForStage(0), 1)
    assert.equal(intervalDaysForStage(1), 3)
    assert.equal(intervalDaysForStage(5), 60)
    assert.equal(intervalDaysForStage(99), 60) // clamped
  })
})

describe('parsePlanJson', () => {
  it('parses valid JSON', () => {
    const raw = JSON.stringify({
      title: 'Test Plan',
      goal: 'Practice',
      tasks: [
        { date: '2026-01-01', title: 'Task 1', kind: 'practice' },
        { date: '2026-01-02', title: 'Task 2', kind: 'review' },
      ],
    })
    const plan = parsePlanJson(raw, '2026-01-01', 2)
    assert.equal(plan.title, 'Test Plan')
    assert.equal(plan.tasks.length, 2)
  })

  it('tolerates code fences and trailing text', () => {
    const raw = 'Here is your plan:\n```json\n{"title":"P","goal":"","tasks":[{"date":"2026-01-01","title":"T"}]}\n```\nGood luck!'
    const plan = parsePlanJson(raw, '2026-01-01', 1)
    assert.equal(plan.title, 'P')
  })

  it('tolerates trailing commas', () => {
    const raw = '{"title":"P","goal":"","tasks":[{"date":"2026-01-01","title":"T",},]}'
    const plan = parsePlanJson(raw, '2026-01-01', 1)
    assert.equal(plan.tasks.length, 1)
  })

  it('filters out-of-range dates', () => {
    const raw = JSON.stringify({
      title: 'P',
      tasks: [
        { date: '2026-01-01', title: 'In' },
        { date: '2026-02-01', title: 'Out' },
      ],
    })
    const plan = parsePlanJson(raw, '2026-01-01', 3)
    assert.equal(plan.tasks.length, 1)
  })

  it('throws on missing title', () => {
    assert.throws(() => parsePlanJson('{"tasks":[]}', '2026-01-01', 1), /title/)
  })
})
