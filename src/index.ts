/**
 * dsh-algo-trainer — 算法学习训练插件 for DeepSeek Harness
 *
 * Host 半边：按会话激活 13 个 agent tools。
 * 数据层用 JSON 文件持久化（替代 SQLite），通过 Node fs 落盘到 DSH_HOME/.icpc-data。
 * 适配层用 fetch 调公开 API（Codeforces + AtCoder）。
 *
 * 注意：本插件以「文件插件」形式通过 cordis.patch.yml 挂载（非动态 Cordis 插件），
 * 因此不使用 harness.handle / host.call（那是动态插件的 Package-private RPC 通道），
 * client 半边仅注册一个静态引导面板；数据读写全部走 icpc_* 工具。
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Context, PluginConfig, FsService } from './dsh-compat.ts'
import { Config, resolveConfig } from './dsh-compat.ts'
import { IcpcStore } from './store/index.ts'
import { createCodeforcesAdapter } from './adapters/codeforces.ts'
import { createAtcoderAdapter } from './adapters/atcoder.ts'
import type { PlatformAdapter, ContestAdapter } from './adapters/types.ts'
import { registerActivationRoute } from './activation.ts'

export const name = 'dsh-algo-trainer'
export const inject = ['tools', 'agents', 'webServer']
export { Config }

export interface IcpcHost {
  store: IcpcStore
  adapters: Record<string, PlatformAdapter & ContestAdapter>
  getAiConfig: () => { enabled: boolean; baseURL: string; apiKey: string; model: string }
}

/**
 * Node 原生 fs 包装为 FsService 接口。
 * 文件插件运行在 Host Node 进程中，node:fs 是唯一可靠的数据落盘通道；
 * dsh 的 ctx.fs 服务接口（resolve/readText/writeText/stat）与本层不兼容，故不使用。
 */
function nodeFs(): FsService {
  return {
    async readFile(p: string): Promise<string> {
      return fs.promises.readFile(p, 'utf8')
    },
    async writeFile(p: string, content: string): Promise<void> {
      await fs.promises.writeFile(p, content, 'utf8')
    },
    async mkdir(p: string): Promise<void> {
      await fs.promises.mkdir(p, { recursive: true })
    },
    async exists(p: string): Promise<boolean> {
      return fs.existsSync(p)
    },
    async readdir(p: string): Promise<string[]> {
      return fs.promises.readdir(p)
    },
  }
}

export function apply(ctx: Context, rawConfig: Partial<PluginConfig> = {}): void {
  const config = resolveConfig(rawConfig)
  // dataDir 留空时使用 DSH 主目录下的 .icpc-data（与 harness 数据目录同级，重启后仍保留）
  const dataDir = config.dataDir || path.join(
    process.env.DSH_HOME || process.env.HOME || process.env.USERPROFILE || '.',
    '.icpc-data',
  )

  const store = new IcpcStore(nodeFs(), dataDir)
  // load() 已在构造器中启动；工具在 ready 之前注册无害（写盘已等待 ready）

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

  registerActivationRoute(ctx, host)
}
