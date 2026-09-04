/**
 * dsh-algo-trainer — 算法学习训练插件 for DeepSeek Harness
 *
 * Host 半边：注册 12 个 agent tools + RPC 方法供 client 面板拉数据。
 * 数据层用 JSON 文件持久化（替代 SQLite），通过 dsh fs 服务落盘到 workspace 目录。
 * 适配层用 fetch 调公开 API（Codeforces + AtCoder）。
 */

import type { Context, PluginConfig } from './dsh-compat.ts'
import { Config, resolveConfig } from './dsh-compat.ts'
import { IcpcStore } from './store/index.ts'
import { createCodeforcesAdapter } from './adapters/codeforces.ts'
import { createAtcoderAdapter } from './adapters/atcoder.ts'
import type { PlatformAdapter, ContestAdapter } from './adapters/types.ts'
import { registerSyncTool } from './tools/sync.ts'
import { registerStatsTool } from './tools/stats.ts'
import { registerTodayTool } from './tools/today.ts'
import { registerPlanTools } from './tools/plans.ts'
import { registerReviewTool } from './tools/reviews.ts'
import { registerTemplateTool } from './tools/templates.ts'
import { registerContestTool } from './tools/contests.ts'
import { registerCheckinTool } from './tools/checkins.ts'
import { registerSettingsTool } from './tools/settings.ts'
import { registerImportTool } from './tools/import.ts'
import { registerProblemTool } from './tools/problems.ts'
import { registerExportTool } from './tools/export.ts'
import { registerRpcHandlers } from './rpc/index.ts'

export const name = 'dsh-algo-trainer'
export const inject = ['tools', 'fs', 'rpc']
export { Config }

export interface IcpcHost {
  store: IcpcStore
  adapters: Record<string, PlatformAdapter & ContestAdapter>
  getAiConfig: () => { enabled: boolean; baseURL: string; apiKey: string; model: string }
}

export function apply(ctx: Context, rawConfig: Partial<PluginConfig> = {}): void {
  const config = resolveConfig(rawConfig)
  const dataDir = config.dataDir || '.icpc-data'

  const store = new IcpcStore(ctx.fs, dataDir)
  void store.load()

  const adapters: Record<string, PlatformAdapter & ContestAdapter> = {
    codeforces: createCodeforcesAdapter(),
    atcoder: createAtcoderAdapter(),
  }

  const getAiConfig = () => {
    const s = store.getSettings()
    return {
      enabled: s.ai.enabled,
      baseURL: s.ai.baseURL,
      apiKey: process.env.AI_API_KEY ?? s.ai.apiKey,
      model: s.ai.model,
    }
  }

  const host: IcpcHost = { store, adapters, getAiConfig }

  ctx.effect(() => () => { void store.flush() })

  // 注册 agent tools（12 个）
  registerSyncTool(host, ctx)
  registerStatsTool(host, ctx)
  registerTodayTool(host, ctx)
  registerPlanTools(host, ctx)
  registerReviewTool(host, ctx)
  registerTemplateTool(host, ctx)
  registerContestTool(host, ctx)
  registerCheckinTool(host, ctx)
  registerSettingsTool(host, ctx)
  registerImportTool(host, ctx)
  registerProblemTool(host, ctx)
  registerExportTool(host, ctx)

  // 注册 RPC 方法供 client 面板调用
  registerRpcHandlers(host, ctx)
}
