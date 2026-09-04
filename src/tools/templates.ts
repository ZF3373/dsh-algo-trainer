import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT } from './helpers.ts'
import { CURRICULUM, TEMPLATE_TOTAL } from '../templates/curriculum.ts'
import { isTemplateId, nextTemplate, TEMPLATE_STATUSES } from '../templates/progress.ts'

export function registerTemplateTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_templates',
    description:
      '管理 114 课算法模板库。action=browse 浏览课程大纲（含进度/下一课推荐）；' +
      'action=next 推荐下一课；action=set_status 设置学习状态（todo/learning/mastered）。',
    parameters: {
      action: { type: 'string', required: true, enum: ['browse', 'next', 'set_status'] },
      templateId: { type: 'string', description: '模板 ID（set_status）' },
      status: { type: 'string', enum: ['todo', 'learning', 'mastered'], description: '学习状态' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const action = args.action as string

      switch (action) {
        case 'browse': {
          const progress = store.getAllProgress()
          let mastered = 0
          let learning = 0
          for (const entry of progress.values()) {
            if (entry.status === 'mastered') mastered++
            else if (entry.status === 'learning') learning++
          }
          const next = nextTemplate(progress)
          return {
            ok: true,
            data: {
              total: TEMPLATE_TOTAL, mastered, learning,
              next: next ? { id: next.id, name: next.name, difficulty: next.difficulty } : null,
              categories: CURRICULUM.map((cat) => ({
                key: cat.key, name: cat.name, description: cat.description,
                templates: cat.templates.map((t) => ({
                  id: t.id, name: t.name, difficulty: t.difficulty, tags: t.tags, outline: t.outline,
                  examples: t.examples,
                  status: progress.get(t.id)?.status ?? 'todo',
                  note: progress.get(t.id)?.note ?? null,
                })),
              })),
            },
          }
        }

        case 'next': {
          const next = nextTemplate(store.getAllProgress())
          if (!next) return { ok: true, next: null }
          const cat = CURRICULUM.find((c) => c.templates.some((t) => t.id === next.id))
          return {
            ok: true,
            next: { id: next.id, name: next.name, category: cat?.name ?? '', difficulty: next.difficulty },
          }
        }

        case 'set_status': {
          const id = args.templateId as string
          const status = args.status as string
          if (!TEMPLATE_STATUSES.includes(status as never))
            return { ok: false, error: "status 需为 'todo' | 'learning' | 'mastered'" }
          if (!isTemplateId(id)) return { ok: false, error: `课程中不存在模板 ${id}` }
          store.setTemplateProgress(id, { status: status as never })
          return { ok: true }
        }

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `模板：${args.action}` }),
  }))
}
