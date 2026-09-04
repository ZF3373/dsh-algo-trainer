import type { PlatformId } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'
import { syncPlatform } from './sync-helpers.ts'

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
      const { store } = host
      const platform = args.platform as string

      if (platform === 'all') {
        const settings = store.getSettings()
        const results = []
        for (const [pf, account] of Object.entries(settings.accounts)) {
          if (!account?.handle || !account.enabled) continue
          const r = await syncPlatform(host, pf as PlatformId, account.handle)
          results.push({ ...r, durationMs: 0 })
        }
        if (results.length === 0) {
          return { ok: false, error: '没有已绑定的启用账号，请先通过 icpc_settings 绑定平台账号' }
        }
        return { ok: true, results }
      }

      if (platform !== 'codeforces' && platform !== 'atcoder') {
        return { ok: false, error: `platform 非法: ${platform}` }
      }

      let handle = typeof args.handle === 'string' ? args.handle.trim() : ''
      if (!handle) handle = store.getHandle(platform) ?? ''
      if (!handle) return { ok: false, error: `未提供 handle 且没有已绑定的 ${platform} 账号` }

      const result = await syncPlatform(host, platform, handle)
      return { ok: true, result }
    },
    presentCall: (args) => ({ card: 'generic', title: `同步 ${args.platform}` }),
  }))
}
