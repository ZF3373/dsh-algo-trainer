import type { PlatformId } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'

export function registerSyncTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_sync',
    description:
      '同步 OJ 平台刷题记录。platform=all 同步所有已绑定账号；指定平台时需提供 handle 或使用已绑定账号。' +
      '同步为增量：仅拉取上次同步后的新提交。支持 codeforces / atcoder。',
    parameters: {
      platform: {
        type: 'string', required: true,
        enum: ['all', 'codeforces', 'atcoder'],
        description: '同步平台',
      },
      handle: {
        type: 'string',
        description: '平台用户名（留空则使用已绑定的 handle）',
      },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store, adapters } = host
      const platform = args.platform as string

      if (platform === 'all') {
        const handles = store.getSettings().handles
        const results = []
        for (const [pf, handle] of Object.entries(handles)) {
          if (!handle) continue
          const adapter = adapters[pf]
          if (!adapter) continue
          const known = store.getKnownExternalIds(pf as PlatformId)
          const subs = await adapter.fetchUserSubmissions(handle, { knownExternalIds: known })
          const result = store.insertSubmissions(
            subs.map((s) => ({
              platform: s.problem.platform,
              problemKey: s.problem.problemKey,
              verdict: s.verdict,
              language: s.language,
              submittedAt: s.submittedAt,
              externalId: s.externalId,
            })),
          )
          // upsert problem metadata
          for (const s of subs) {
            store.upsertProblem({
              platform: s.problem.platform,
              problemKey: s.problem.problemKey,
              title: s.problem.title,
              difficulty: s.problem.difficulty ?? null,
              url: s.problem.url ?? null,
              tags: s.problem.tags,
            })
          }
          results.push({ platform: pf, handle, ...result })
        }
        return { ok: true, results }
      }

      if (platform !== 'codeforces' && platform !== 'atcoder') {
        return { ok: false, error: `platform 非法: ${platform}` }
      }

      let handle = typeof args.handle === 'string' ? args.handle.trim() : ''
      if (!handle) handle = store.getHandle(platform) ?? ''
      if (!handle) return { ok: false, error: `未提供 handle 且没有已绑定的 ${platform} 账号` }

      const adapter = adapters[platform]
      const known = store.getKnownExternalIds(platform)
      const subs = await adapter.fetchUserSubmissions(handle, { knownExternalIds: known })
      const result = store.insertSubmissions(
        subs.map((s) => ({
          platform: s.problem.platform,
          problemKey: s.problem.problemKey,
          verdict: s.verdict,
          language: s.language,
          submittedAt: s.submittedAt,
          externalId: s.externalId,
        })),
      )
      for (const s of subs) {
        store.upsertProblem({
          platform: s.problem.platform,
          problemKey: s.problem.problemKey,
          title: s.problem.title,
          difficulty: s.problem.difficulty ?? null,
          url: s.problem.url ?? null,
          tags: s.problem.tags,
        })
      }
      return { ok: true, handle, ...result }
    },
    presentCall: (args) => ({ card: 'generic', title: `同步 ${args.platform}` }),
  }))
}
