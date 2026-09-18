/**
 * dsh-algo-trainer — Client 半边
 *
 * 以「文件插件」形式挂载（cordis.patch.yml），因此这里是一个 Cordis client 插件：
 * 导出 name/inject/apply，通过 ctx.get('slots') 在设置页注册一个引导面板。
 *
 * 数据通道说明：文件插件没有动态插件的 host.call / harness.handle Package-private
 * RPC（host 侧也无 rpc 服务），所以面板只渲染静态引导内容；全部数据读写由 icpc_*
 * agent 工具完成。若未来 dsh 提供文件插件的 client→host 通道，可在此扩展。
 */

/** 本插件在 client 运行时中注入的服务（只读必需项） */
export const inject = ['slots']

export const name = 'dsh-algo-trainer'

/** 面板元数据 */
export const panel = {
  id: 'icpc-dashboard',
  title: 'ICPC 训练台',
  description: '今日训练 · 打卡 · 赛事 · 弱项',
}

interface SlotsLike {
  inject(key: string, cb: () => unknown): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

interface ClientCtx {
  slots?: SlotsLike
  get?(name: string): unknown
}

export function apply(ctx: ClientCtx): void {
  // 已通过 inject: ['slots'] 声明服务依赖，运行时注入为 ctx.slots；ctx.get 兜底
  const slots = ctx.slots ?? (ctx.get ? ctx.get('slots') as SlotsLike | undefined : undefined)
  if (!slots) return

  slots.inject('settings.section', () => {
    const off = slots.register(
      {
        name: 'settings.section',
        id: `${name}-settings`,
        order: 50,
        label: '算法训练台',
      },
      SettingsPanel,
    )
    return off
  })
}

/** 静态引导面板：说明插件能力与使用方式（数据通过 icpc_* 工具交互） */
function SettingsPanel(_props: Record<string, unknown>): unknown {
  const react = getReact()
  if (!react) return null
  const h = react.createElement

  const tools = [
    ['icpc_sync', '同步 CF/AtCoder 刷题记录（增量）'],
    ['icpc_stats', '统计 / 弱项画像 / 趋势'],
    ['icpc_today', '今日三档训练推荐'],
    ['icpc_generate_plan', '生成训练计划（AI 或模板）'],
    ['icpc_manage_plan', '计划管理 / 打卡'],
    ['icpc_review', '间隔复习库'],
    ['icpc_templates', '114 课算法模板库'],
    ['icpc_contests', '赛事中心'],
    ['icpc_settings', '账号 / AI / 提醒设置'],
    ['icpc_import', '手动导入刷题记录'],
    ['icpc_problems', '浏览 / 搜索题目库'],
    ['icpc_export', '导出训练计划数据包'],
  ]

  return h('div', { style: { padding: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' } }, [
    h('h2', { key: 'title', style: { margin: '0 0 8px 0', fontSize: '18px' } }, '🧩 ICPC 训练台'),
    h('p', { key: 'sub', style: { margin: '0 0 12px 0', fontSize: '13px', color: '#666' } },
      '算法学习训练插件。数据与统计通过下列 agent 工具读写，请在对话中让助手调用对应工具。'),
    h('div', { key: 'tools', style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      tools.map(([id, desc]) =>
        h('div', { key: id, style: { fontSize: '12px' } }, [
          h('code', { key: 'n', style: { fontWeight: 600, marginRight: '6px' } }, id),
          h('span', { key: 'd', style: { color: '#888' } }, desc),
        ]),
      ),
    ),
    h('p', { key: 'tip', style: { margin: '12px 0 0 0', fontSize: '12px', color: '#999' } },
      '数据保存在 DSH 主目录 .icpc-data/ 下（JSON），重启后保留。'),
  ])
}

function getReact(): {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown
} | null {
  try {
    const r = (globalThis as Record<string, unknown>).React as
      | { createElement?: unknown }
      | undefined
    if (r && typeof r.createElement === 'function') return r as never
  } catch {
    // ignore
  }
  return null
}
