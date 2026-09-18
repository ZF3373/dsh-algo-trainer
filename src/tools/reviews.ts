import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'
import { scheduleNext, intervalDaysForStage } from '../reviews/schedule.ts'

export function registerReviewTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_review',
    description:
      '管理间隔复习库。action=list 列出复习队列（due=1 只看到期）；' +
      'action=add 加入复习队列（需 platform + problemKey）；' +
      'action=feedback 提交复习反馈排期（hard/ok/easy）；' +
      'action=note 更新复习笔记；action=remove 移出队列。',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'add', 'feedback', 'note', 'remove'] },
      due: { type: 'boolean', description: 'list 时只看到期（默认 false）' },
      platform: { type: 'string', enum: ['codeforces', 'atcoder'], description: '平台（add）' },
      problemKey: { type: 'string', description: '题目标识（add）' },
      id: { type: 'number', description: '复习条目 ID（feedback/note/remove）' },
      feedback: { type: 'string', enum: ['hard', 'ok', 'easy'], description: '复习反馈' },
      note: { type: 'string', description: '笔记内容（note）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const action = args.action as string

      switch (action) {
        case 'list':
          return { ok: true, items: store.listReviews(args.due === true).map((r) => ({ ...r, intervalDays: intervalDaysForStage(r.stage) })) }

        case 'add': {
          const platform = args.platform as string
          const problemKey = typeof args.problemKey === 'string' ? args.problemKey.trim() : ''
          if (!platform || !problemKey) return { ok: false, error: 'platform 与 problemKey 必填' }
          const problem = store.findProblem(platform as never, problemKey)
          if (!problem) return { ok: false, error: `题库中不存在 ${platform}/${problemKey}，请先同步` }
          const review = store.addReview(problem)
          return { ok: true, id: review.id }
        }

        case 'feedback': {
          const id = Number(args.id)
          const feedback = args.feedback as 'hard' | 'ok' | 'easy' | undefined
          if (!Number.isInteger(id)) return { ok: false, error: 'id 必填' }
          if (!feedback || !['hard', 'ok', 'easy'].includes(feedback)) return { ok: false, error: "feedback 需为 'hard' | 'ok' | 'easy'" }
          const item = store.getReview(id)
          if (!item) return { ok: false, error: '复习条目不存在' }
          const todayStr = new Date().toISOString().slice(0, 10)
          const next = scheduleNext(item.stage, feedback, todayStr)
          store.updateReview(id, { stage: next.stage, nextDueOn: next.nextDueOn, lastReviewedAt: new Date().toISOString() })
          return { ok: true, ...next }
        }

        case 'note': {
          const id = Number(args.id)
          if (!Number.isInteger(id)) return { ok: false, error: 'id 必填' }
          if (typeof args.note !== 'string') return { ok: false, error: 'note 需为字符串' }
          if (!store.updateReview(id, { note: args.note.trim() === '' ? null : args.note })) return { ok: false, error: '复习条目不存在' }
          return { ok: true }
        }

        case 'remove': {
          const id = Number(args.id)
          if (!Number.isInteger(id)) return { ok: false, error: 'id 必填' }
          if (!store.deleteReview(id)) return { ok: false, error: '复习条目不存在' }
          return { ok: true }
        }

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `复习：${args.action}` }),
  }))
}
