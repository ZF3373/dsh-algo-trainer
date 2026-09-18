export type FeatureGroup = 'training' | 'records'
export type FeatureIcon =
  | 'assistant'
  | 'overview'
  | 'today'
  | 'plans'
  | 'reviews'
  | 'templates'
  | 'problems'
  | 'sync'
  | 'import'
  | 'export'
  | 'checkins'
  | 'contests'
  | 'settings'

export interface WorkbenchFeature {
  id: string
  group: FeatureGroup
  label: string
  description: string
  icon: FeatureIcon
  prompt?: string
}

export const FEATURE_GROUPS: ReadonlyArray<{ id: FeatureGroup; label: string }> = [
  { id: 'training', label: '训练' },
  { id: 'records', label: '记录与设置' },
]

export const WORKBENCH_FEATURES: readonly WorkbenchFeature[] = [
  {
    id: 'assistant',
    group: 'training',
    label: 'AI 助手',
    description: '使用当前 Harness 对话',
    icon: 'assistant',
  },
  {
    id: 'overview',
    group: 'training',
    label: '数据概览',
    description: '提交、AC 率、弱项与趋势',
    icon: 'overview',
    prompt: '请调用 icpc_stats 工具，先展示我的总体训练概览和弱项画像。',
  },
  {
    id: 'today',
    group: 'training',
    label: '今日训练',
    description: '巩固、同段与挑战题',
    icon: 'today',
    prompt: '请调用 icpc_today 工具，给我今天的三档训练推荐并说明选题理由。',
  },
  {
    id: 'plans',
    group: 'training',
    label: '训练计划',
    description: '查看、生成与打卡',
    icon: 'plans',
    prompt: '请调用 icpc_manage_plan 工具列出我的训练计划；如果没有计划，再询问我计划天数并准备生成。',
  },
  {
    id: 'reviews',
    group: 'training',
    label: '复习库',
    description: '到期复评与遗忘曲线',
    icon: 'reviews',
    prompt: '请调用 icpc_review 工具列出我的复习库，并优先展示今天到期的题目。',
  },
  {
    id: 'templates',
    group: 'training',
    label: '模板库',
    description: '114 课算法模板与进度',
    icon: 'templates',
    prompt: '请调用 icpc_templates 工具浏览我的模板课程，并推荐下一课。',
  },
  {
    id: 'problems',
    group: 'records',
    label: '题目管理',
    description: '搜索题库与题目详情',
    icon: 'problems',
    prompt: '请调用 icpc_problems 工具浏览题目库，并询问我需要的平台、难度或标签筛选。',
  },
  {
    id: 'sync',
    group: 'records',
    label: '提交同步',
    description: '同步 Codeforces 与 AtCoder',
    icon: 'sync',
    prompt: '请调用 icpc_sync 工具同步我已绑定平台的刷题记录，并汇报新增提交数。',
  },
  {
    id: 'import',
    group: 'records',
    label: '手动导入',
    description: '导入 JSON 或 CSV 记录',
    icon: 'import',
    prompt: '请调用 icpc_import 工具协助我导入刷题记录；先询问平台以及要粘贴的 JSON 或 CSV 内容。',
  },
  {
    id: 'export',
    group: 'records',
    label: '数据导出',
    description: '导出训练计划数据包',
    icon: 'export',
    prompt: '请调用 icpc_export 工具导出我的训练计划数据包，并告诉我可用的输出内容。',
  },
  {
    id: 'checkins',
    group: 'records',
    label: '日历打卡',
    description: '连续打卡与每日任务',
    icon: 'checkins',
    prompt: '请调用 icpc_checkin 工具查看我的打卡连续天数，并列出今天的任务。',
  },
  {
    id: 'contests',
    group: 'records',
    label: '赛事中心',
    description: '近期 Codeforces 与 AtCoder',
    icon: 'contests',
    prompt: '请调用 icpc_contests 工具列出近期赛事，并按开赛时间排序。',
  },
  {
    id: 'settings',
    group: 'records',
    label: '设置',
    description: '账号、AI 与提醒配置',
    icon: 'settings',
    prompt: '请调用 icpc_settings 工具读取当前设置，并脱敏展示账号、适配器和提醒配置。',
  },
]

export function featurePrompt(id: string): string {
  const feature = WORKBENCH_FEATURES.find((item) => item.id === id)
  if (!feature?.prompt) throw new Error(`feature ${id} has no prompt`)
  return feature.prompt
}
