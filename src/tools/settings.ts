import type { PlatformId } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'

export function registerSettingsTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_settings',
    description:
      '管理设置。action=get 获取当前设置（AI 配置/平台账号）；' +
      'action=set_account 绑定平台账号（platform+handle）；' +
      'action=set_ai 配置 AI（enabled/baseURL/apiKey/model）。',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'set_account', 'set_ai'] },
      platform: { type: 'string', enum: ['codeforces', 'atcoder'], description: '平台（set_account）' },
      handle: { type: 'string', description: '平台用户名（set_account）' },
      aiEnabled: { type: 'boolean', description: 'AI 开关（set_ai）' },
      baseURL: { type: 'string', description: 'AI base URL（set_ai）' },
      apiKey: { type: 'string', description: 'AI API key（set_ai）' },
      model: { type: 'string', description: 'AI 模型名（set_ai）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const action = args.action as string

      switch (action) {
        case 'get':
          return { ok: true, settings: store.getSettings() }

        case 'set_account': {
          const platform = args.platform as PlatformId
          const handle = typeof args.handle === 'string' ? args.handle.trim() : ''
          if (!platform || !['codeforces', 'atcoder'].includes(platform))
            return { ok: false, error: `platform 非法` }
          if (!handle) return { ok: false, error: 'handle 必填' }
          store.updateSettings({ handles: { [platform]: handle } })
          return { ok: true }
        }

        case 'set_ai': {
          const patch: Record<string, unknown> = {}
          if (typeof args.aiEnabled === 'boolean') patch.enabled = args.aiEnabled
          if (typeof args.baseURL === 'string') patch.baseURL = args.baseURL
          if (typeof args.apiKey === 'string') patch.apiKey = args.apiKey
          if (typeof args.model === 'string') patch.model = args.model
          store.updateSettings({ ai: patch as never })
          return { ok: true, ai: store.getSettings().ai }
        }

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `设置：${args.action}` }),
  }))
}
