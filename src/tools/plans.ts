import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, num, str } from './helpers.ts'
import { generatePlan, parsePlanJson, today, addDays, TASK_KINDS } from '../plans/planService.ts'

export function registerPlanTools(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_generate_plan',
    description:
      '生成训练计划。基于 AI（需配置 API Key）分析弱项/趋势/水平后生成每日任务；' +
      '未配置 AI 时降级为模板计划。返回 planId 供后续查看/打卡。',
    parameters: {
      days: { type: 'number', description: '计划天数（默认 14，范围 1-90）' },
      startDate: { type: 'string', description: '起始日期 YYYY-MM-DD（默认今天）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const days = num(args.days, 14, 1, 90)
      const startDate = str(args.startDate) ?? today()
      try {
        const result = await generatePlan(host.store, host.getAiConfig(), { days, startDate })
        return { ok: true, ...result }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
    presentCall: () => ({ card: 'generic', title: '生成训练计划' }),
  }))

  ctx.tools.register(defineTool({
    name: 'icpc_manage_plan',
    description:
      '管理训练计划。action=list 列出所有计划；action=detail 查看计划详情；' +
      'action=checkin 打卡；action=uncheck 取消打卡；action=delete 删除计划；' +
      'action=import 导入 AI 返回的 JSON 计划文本。',
    parameters: {
      action: {
        type: 'string', required: true,
        enum: ['list', 'detail', 'checkin', 'uncheck', 'delete', 'import'],
      },
      planId: { type: 'number', description: '计划 ID（detail/delete）' },
      taskId: { type: 'number', description: '任务 ID（checkin/uncheck）' },
      raw: { type: 'string', description: 'AI JSON 文本（import）' },
      days: { type: 'number', description: '计划天数（import，默认 14）' },
      startDate: { type: 'string', description: '起始日期（import）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const action = args.action as string

      switch (action) {
        case 'list':
          return { ok: true, plans: store.listPlans().map((p) => ({
            id: p.id, title: p.title, goal: p.goal, startDate: p.startDate, endDate: p.endDate,
            source: p.source, createdAt: p.createdAt,
            taskCount: p.tasks.length,
            checkedCount: p.tasks.filter((t) => t.checked).length,
          })) }

        case 'detail': {
          const id = Number(args.planId)
          const plan = store.getPlan(id)
          if (!plan) return { ok: false, error: '计划不存在' }
          return { ok: true, plan }
        }

        case 'checkin': {
          const taskId = Number(args.taskId)
          if (!Number.isInteger(taskId)) return { ok: false, error: 'taskId 必填' }
          const found = store.findTask(taskId)
          if (!found) return { ok: false, error: '任务不存在' }
          store.toggleCheckin(taskId, true)
          return { ok: true }
        }

        case 'uncheck': {
          const taskId = Number(args.taskId)
          if (!Number.isInteger(taskId)) return { ok: false, error: 'taskId 必填' }
          store.toggleCheckin(taskId, false)
          return { ok: true }
        }

        case 'delete': {
          const id = Number(args.planId)
          if (!Number.isInteger(id)) return { ok: false, error: 'planId 必填' }
          const ok = store.deletePlan(id)
          return ok ? { ok: true } : { ok: false, error: '计划不存在' }
        }

        case 'import': {
          const raw = args.raw
          if (typeof raw !== 'string' || raw.trim() === '')
            return { ok: false, error: 'raw 必填' }
          const sd = str(args.startDate) ?? today()
          const d = num(args.days, 14, 1, 90)
          try {
            const parsed = parsePlanJson(raw, sd, d)
            const plan = store.createPlan({
              title: parsed.title, goal: parsed.goal,
              startDate: parsed.startDate, endDate: addDays(sd, d - 1),
              source: 'ai', rawPrompt: raw,
              tasks: parsed.tasks.map((t) => ({
                id: 0, taskDate: t.date, title: t.title,
                kind: (TASK_KINDS as readonly string[]).includes(t.kind ?? '') ? (t.kind as never) : 'practice',
                url: t.url ?? null, note: t.note ?? null, checked: false,
              })),
            })
            return { ok: true, planId: plan.id, title: plan.title, taskCount: plan.tasks.length }
          } catch (e) {
            return { ok: false, error: `导入失败：${(e as Error).message}` }
          }
        }

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `计划：${args.action}` }),
  }))
}
