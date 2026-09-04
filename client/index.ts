/**
 * Client 半边：ICPC Workbench 紧凑仪表盘面板
 *
 * 注册一个 Slot UI，展示今日训练 + 打卡 + 近期赛事。
 * 通过 host.call('icpc.dashboard') / host.call('icpc.trend') / host.call('icpc.contests') 拉数据。
 *
 * 这是结构兼容的客户端组件定义——在真实 dsh 运行时中会被 Slot 渲染器加载。
 */

export interface DashboardData {
  stats: {
    attempts: number
    ac: number
    acRate: number
    solvedProblems: number
    byPlatform: Array<{ platform: string; attempts: number; ac: number; acRate: number; solved: number }>
  }
  weakness: { items: Array<{ tag: string; gap: number; attempts: number; ac: number; acRate: number }> }
  level: number
  bands: Array<{
    key: string
    label: string
    description: string
    problems: Array<{ problemKey: string; title: string; difficulty: number | null; url: string | null; weakTags: string[] }>
    pool: number
  }>
  streak: { current: number; longest: number; totalDays: number }
  dueReviews: number
  todayTasks: Array<{ id: number; taskDate: string; title: string; kind: string; checked: boolean; url?: string | null }>
  todayProgress: { total: number; checked: number } | null
}

export interface ContestData {
  contests: Array<{
    id: string
    platform: string
    name: string
    category: string
    startTimeIso: string
    durationMinutes: number
    url: string
  }>
}

/** Client RPC 接口（dsh client 框架注入） */
export interface ClientHost {
  call: (method: string, params?: unknown) => Promise<unknown>
}

/** 面板元数据 */
export const panel = {
  id: 'icpc-dashboard',
  title: 'ICPC 训练台',
  description: '今日训练 · 打卡 · 赛事 · 弱项',
}

/**
 * 面板渲染函数：接收 host，返回渲染所需数据与视图描述。
 * dsh Slot 渲染器调用此函数，data 通过 host.call 异步拉取。
 */
export async function loadDashboard(host: ClientHost): Promise<DashboardData> {
  return (await host.call('icpc.dashboard')) as DashboardData
}

export async function loadContests(host: ClientHost): Promise<ContestData> {
  return (await host.call('icpc.contests')) as ContestData
}

/** 纯函数：格式化仪表盘为紧凑文本视图（供无 React 环境降级展示） */
export function renderDashboardText(data: DashboardData): string {
  const lines: string[] = []
  lines.push('═══ ICPC 训练台 ═══')
  lines.push('')
  lines.push(`📊 总计: ${data.stats.attempts} 次提交 · ${data.stats.ac} AC · AC率 ${data.stats.acRate}% · 解题 ${data.stats.solvedProblems}`)
  lines.push(`🎯 能力值: ${data.level}`)
  lines.push(`🔥 连续打卡: ${data.streak.current} 天 (最长 ${data.streak.longest})`)
  lines.push(`📋 今日: ${data.todayProgress ? `${data.todayProgress.checked}/${data.todayProgress.total} 完成` : '无计划任务'}`)
  lines.push(`🔄 到期复习: ${data.dueReviews} 题`)
  lines.push('')

  lines.push('── 今日训练 ──')
  for (const band of data.bands) {
    lines.push(`【${band.label}】${band.description}`)
    for (const p of band.problems) {
      const diff = p.difficulty ? ` [${p.difficulty}]` : ''
      const weak = p.weakTags.length > 0 ? ` ⚠弱项:${p.weakTags.join(',')}` : ''
      lines.push(`  ${p.problemKey}《${p.title}》${diff}${weak}`)
    }
  }
  lines.push('')

  if (data.weakness.items.length > 0) {
    lines.push('── 弱项 Top5 ──')
    for (const w of data.weakness.items) {
      lines.push(`  ${w.tag}: gap=${w.gap} (${w.ac}/${w.attempts}=${w.acRate}%)`)
    }
    lines.push('')
  }

  if (data.todayTasks.length > 0) {
    lines.push('── 今日任务 ──')
    for (const t of data.todayTasks) {
      const mark = t.checked ? '✅' : '⬜'
      lines.push(`  ${mark} ${t.title} [${t.kind}]`)
    }
  }

  return lines.join('\n')
}

/** 紧凑赛事列表文本 */
export function renderContestsText(data: ContestData): string {
  const lines: string[] = ['── 近期赛事 ──']
  for (const c of data.contests) {
    const time = new Date(c.startTimeIso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    lines.push(`  ${c.platform} | ${c.name} | ${time} | ${Math.round(c.durationMinutes / 60)}h`)
  }
  return lines.join('\n')
}

/** React 组件定义（dsh Slot 渲染器在 React 环境中加载） */
export function DashboardComponent({ data, contests }: { data: DashboardData; contests?: ContestData }): {
  type: string
  props: Record<string, unknown>
} {
  return {
    type: 'div',
    props: {
      className: 'icpc-dashboard',
      children: [
        { type: 'h2', props: { children: 'ICPC 训练台' } },
        { type: 'div', props: { children: renderDashboardText(data) } },
        ...(contests ? [{ type: 'div', props: { children: renderContestsText(contests) } }] : []),
      ],
    },
  }
}
