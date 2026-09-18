import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, str } from './helpers.ts'

export function registerCheckinTool(host: IcpcHost, ctx: Context): () => void {
  return ctx.tools.register(defineTool({
    name: 'icpc_checkin',
    description:
      '管理日历打卡。action=streak 连续打卡统计；action=month 月视图（month=YYYY-MM）；' +
      'action=date 某天任务列表；action=checkin 打卡（taskId）；action=uncheck 取消打卡。',
    parameters: {
      action: { type: 'string', required: true, enum: ['streak', 'month', 'date', 'checkin', 'uncheck'] },
      month: { type: 'string', description: '月份 YYYY-MM（month）' },
      date: { type: 'string', description: '日期 YYYY-MM-DD（date）' },
      taskId: { type: 'number', description: '任务 ID（checkin/uncheck）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const action = args.action as string
      const todayStr = new Date().toISOString().slice(0, 10)

      switch (action) {
        case 'streak':
          return { ok: true, ...store.getStreak(todayStr) }

        case 'month': {
          const month = str(args.month)
          if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
            return { ok: false, error: 'month 格式需为 YYYY-MM' }
          return { ok: true, days: store.getMonthView(month) }
        }

        case 'date': {
          const date = str(args.date)
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
            return { ok: false, error: 'date 格式需为 YYYY-MM-DD' }
          return { ok: true, tasks: store.getTasksByDate(date) }
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

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `打卡：${args.action}` }),
  }))
}
