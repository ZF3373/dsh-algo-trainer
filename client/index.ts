import { createElement } from 'react'
import { HeaderAction, WorkbenchPanel } from './WorkbenchPanel.tsx'

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']
export const name = 'dsh-algo-trainer'

const TAB_ID = 'dsh-algo-trainer.workbench'
const TAB_KIND = 'icpc-workbench'

interface SlotsLike {
  inject(key: string, cb: () => unknown): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

interface SidebarRightLike {
  openTab(kind: string): void
  toggleExpanded(): void
}

interface SidebarRightTabsLike {
  register(definition: Record<string, unknown>): () => void
}

interface ClientCtx {
  slots: SlotsLike
  sidebarRight: SidebarRightLike
  sidebarRightTabs: SidebarRightTabsLike
  effect(fn: () => void | (() => void)): void
}

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    title: () => 'ICPC Workbench',
  }))

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        inject: () => ({
          collapseSidebar: () => ctx.sidebarRight.toggleExpanded(),
        }),
      },
      WorkbenchPanel,
    ),
  ))

  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: `${name}.open`,
        order: 80,
        inject: () => ({
          open: () => ctx.sidebarRight.openTab(TAB_KIND),
        }),
      },
      HeaderAction,
    ),
  ))

  ctx.effect(() => ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: `${name}-settings`,
        order: 50,
        label: '算法训练台',
      },
      SettingsPanel,
    ),
  ))
}

function SettingsPanel(): unknown {
  const tools = [
    ['icpc_sync', '同步 CF/AtCoder 刷题记录'],
    ['icpc_stats', '统计 / 弱项画像 / 趋势'],
    ['icpc_today', '今日三档训练推荐'],
    ['icpc_generate_plan', '生成训练计划'],
    ['icpc_manage_plan', '计划管理 / 打卡'],
    ['icpc_review', '间隔复习库'],
    ['icpc_templates', '算法模板库'],
    ['icpc_contests', '赛事中心'],
    ['icpc_settings', '账号 / AI / 提醒设置'],
    ['icpc_import', '手动导入刷题记录'],
    ['icpc_problems', '浏览 / 搜索题目库'],
    ['icpc_export', '导出训练计划数据包'],
  ]

  return createElement(
    'div',
    { style: { padding: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' } },
    createElement('h2', { style: { margin: '0 0 8px 0', fontSize: '18px' } }, 'ICPC 训练台'),
    createElement(
      'p',
      { style: { margin: '0 0 12px 0', fontSize: '13px', color: 'var(--dsw-alias-label-caption)' } },
      '在会话头部打开 ICPC Workbench；点击功能入口后才会把训练工具注册到当前会话。',
    ),
    createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      tools.map(([id, description]) => createElement(
        'div',
        { key: id, style: { fontSize: '12px' } },
        createElement('code', { style: { fontWeight: 600, marginRight: '6px' } }, id),
        createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, description),
      )),
    ),
  )
}
