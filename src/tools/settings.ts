import type { PlatformId } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'

export function registerSettingsTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_settings',
    description:
      '管理设置。action=get 获取全部设置（AI/账号/适配器开关/Cookie/提醒）；' +
      'action=set_account 绑定平台账号；action=set_ai 配置 AI；' +
      'action=set_adapter 设置适配器开关；action=set_cookies 设置 Cookie；' +
      'action=set_reminder 设置打卡提醒。',
    parameters: {
      action: {
        type: 'string', required: true,
        enum: ['get', 'set_account', 'set_ai', 'set_adapter', 'set_cookies', 'set_reminder'],
      },
      platform: { type: 'string', enum: ['codeforces', 'atcoder'] },
      handle: { type: 'string' },
      enabled: { type: 'boolean', description: '开关（set_adapter/set_reminder）' },
      cookie: { type: 'string', description: 'Cookie（set_cookies，空串清除）' },
      csrf: { type: 'string', description: 'CSRF token（set_cookies，空串清除）' },
      aiEnabled: { type: 'boolean', description: 'AI 开关（set_ai）' },
      baseURL: { type: 'string' },
      apiKey: { type: 'string' },
      model: { type: 'string' },
      time: { type: 'string', description: '提醒时间 HH:MM（set_reminder）' },
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
          if (!platform || !['codeforces', 'atcoder'].includes(platform)) return { ok: false, error: 'platform 非法' }
          if (!handle) return { ok: false, error: 'handle 必填' }
          store.setAccount(platform, handle)
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

        case 'set_adapter': {
          const platform = args.platform as PlatformId
          if (!platform || !['codeforces', 'atcoder'].includes(platform)) return { ok: false, error: 'platform 非法' }
          store.setAdapterEnabled(platform, args.enabled === true)
          return { ok: true }
        }

        case 'set_cookies': {
          const platform = args.platform as PlatformId
          if (!platform || !['codeforces', 'atcoder'].includes(platform)) return { ok: false, error: 'platform 非法' }
          store.setCookie(
            platform,
            typeof args.cookie === 'string' ? args.cookie : undefined,
            typeof args.csrf === 'string' ? args.csrf : undefined,
          )
          return { ok: true }
        }

        case 'set_reminder': {
          if (args.enabled !== undefined && typeof args.enabled !== 'boolean') return { ok: false, error: 'enabled 需为布尔值' }
          if (args.time !== undefined) {
            if (typeof args.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) return { ok: false, error: 'time 格式需为 HH:MM' }
          }
          store.setReminder(
            typeof args.enabled === 'boolean' ? args.enabled : undefined,
            typeof args.time === 'string' ? args.time : undefined,
          )
          return { ok: true, reminder: store.getSettings().reminder }
        }

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `设置：${args.action}` }),
  }))
}
