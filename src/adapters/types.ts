import type { NormalizedSubmission, PlatformId } from '../types.ts'

export interface FetchOptions {
  since?: string
  knownExternalIds?: Set<string>
}

export interface PlatformAdapter {
  readonly platform: PlatformId
  readonly knownIdsFilter?: boolean
  fetchUserSubmissions(handle: string, opts?: FetchOptions): Promise<NormalizedSubmission[]>
  problemUrl(problemKey: string): string
}

export interface ContestAdapter {
  fetchContests(): Promise<Array<{
    id: string
    platform: PlatformId
    name: string
    category: string
    startTimeIso: string | null
    durationMinutes: number
    phase: string
    url: string
  }>>
}
