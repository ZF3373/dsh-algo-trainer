import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, num, str } from './helpers.ts'
import { buildPlanPackage, today } from '../plans/planService.ts'

export function registerExportTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_export',
    description:
      '导出 AI 训练计划数据包。action=plan_package 返回完整数据包（弱项画像/趋势/推荐题/渲染好的提示词）；' +
      'action=plan_prompt 只返回渲染好的提示词文本（可复制喂给任意大模型，再通过 icpc_manage_plan import 导回）。',
    parameters: {
      action: { type: 'string', required: true, enum: ['plan_package', 'plan_prompt'] },
      days: { type: 'number', description: '计划天数（默认 14，范围 1-90）' },
      startDate: { type: 'string', description: '起始日期 YYYY-MM-DD（默认今天）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const action = args.action as string
      const days = num(args.days, 14, 1, 90)
      const startDate = str(args.startDate) ?? today()
      const pkg = buildPlanPackage(host.store, { days, startDate })

      if (action === 'plan_prompt') {
        return { ok: true, prompt: pkg.prompt, meta: pkg.meta }
      }
      return {
        ok: true,
        profile: pkg.profile,
        trend: pkg.trend,
        problems: pkg.problems,
        problemGroups: pkg.problemGroups,
        level: pkg.level,
        prompt: pkg.prompt,
        meta: pkg.meta,
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `导出：${args.action}` }),
  }))
}
