import type { PlatformId } from '../types.ts'
import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, str } from './helpers.ts'
import { CURRICULUM, TEMPLATE_TOTAL } from '../templates/curriculum.ts'
import { isTemplateId, nextTemplate, TEMPLATE_STATUSES } from '../templates/progress.ts'
import { syncPlatform } from '../tools/sync-helpers.ts'

const customId = (dbId: number): string => `c-${dbId}`

export function registerTemplateTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_templates',
    description:
      '管理 114 课算法模板库。action=browse 浏览大纲（含进度/自建模板/例题状态/下一课推荐）；' +
      'action=next 推荐下一课；action=set_status 设置学习状态；action=set_note 更新笔记；' +
      'action=set_content 填充模板内容（code/idea/complexity/url）；' +
      'action=create_custom / update_custom / delete_custom 管理自建模板；' +
      'action=collect_example 例题一键入库；action=sync_examples 同步模板例题 AC 状态。',
    parameters: {
      action: {
        type: 'string', required: true,
        enum: ['browse', 'next', 'set_status', 'set_note', 'set_content',
               'create_custom', 'update_custom', 'delete_custom',
               'collect_example', 'sync_examples'],
      },
      templateId: { type: 'string', description: '模板 ID（set_status/set_note/set_content/sync_examples）' },
      status: { type: 'string', enum: ['todo', 'learning', 'mastered'] },
      note: { type: 'string', description: '笔记（set_note）' },
      code: { type: 'string', description: '模板代码（set_content/create_custom/update_custom）' },
      idea: { type: 'string', description: '思路' },
      complexity: { type: 'string', description: '复杂度分析' },
      url: { type: 'string', description: '参考链接' },
      customId: { type: 'number', description: '自建模板 ID（update_custom/delete_custom）' },
      categoryKey: { type: 'string', description: '课程分类 key（create_custom）' },
      name: { type: 'string', description: '模板名称（create_custom/update_custom）' },
      difficulty: { type: 'number', description: '难度 1-5（create_custom/update_custom）' },
      tags: { type: 'array', items: { type: 'string' } },
      platform: { type: 'string', enum: ['codeforces', 'atcoder'], description: '例题平台（collect_example）' },
      key: { type: 'string', description: '例题标识（collect_example）' },
      title: { type: 'string', description: '例题标题（collect_example）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const { store } = host
      const action = args.action as string

      switch (action) {
        case 'browse': {
          const progress = store.getAllProgress()
          const custom = store.listCustomTemplates()
          const examplePairs: Array<{ platform: string; key: string }> = []
          for (const cat of CURRICULUM)
            for (const t of cat.templates)
              for (const ex of t.examples) examplePairs.push({ platform: ex.platform, key: ex.key })
          const exampleStatus = store.loadExampleStatus(examplePairs)

          const customByCategory = new Map<string, typeof custom>()
          for (const row of custom) {
            const list = customByCategory.get(row.categoryKey) ?? []
            list.push(row)
            customByCategory.set(row.categoryKey, list)
          }

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
              total: TEMPLATE_TOTAL, mastered, learning, customCount: custom.length,
              next: next ? { id: next.id, name: next.name, difficulty: next.difficulty } : null,
              categories: CURRICULUM.map((cat) => ({
                key: cat.key, name: cat.name, description: cat.description,
                templates: [
                  ...cat.templates.map((t) => ({
                    custom: false, ...t,
                    examples: t.examples.map((ex) => ({
                      ...ex,
                      ...(exampleStatus.get(`${ex.platform}:${ex.key}`) ?? { inBank: false, ac: false }),
                    })),
                    status: progress.get(t.id)?.status ?? 'todo',
                    note: progress.get(t.id)?.note ?? null,
                    content: progress.get(t.id)?.code != null
                      ? { code: progress.get(t.id)?.code, idea: progress.get(t.id)?.idea, complexity: progress.get(t.id)?.complexity, url: progress.get(t.id)?.url }
                      : null,
                  })),
                  ...(customByCategory.get(cat.key) ?? []).map((row) => ({
                    custom: true,
                    id: customId(row.id),
                    name: row.name,
                    difficulty: Math.min(5, Math.max(1, row.difficulty)),
                    tags: row.tags,
                    code: row.code,
                    idea: row.idea ?? '',
                    complexity: row.complexity ?? '',
                    outline: '',
                    examples: [] as never[],
                    status: progress.get(customId(row.id))?.status ?? 'todo',
                    note: progress.get(customId(row.id))?.note ?? null,
                    content: null,
                  })),
                ],
              })),
            },
          }
        }

        case 'next': {
          const next = nextTemplate(store.getAllProgress())
          if (!next) return { ok: true, next: null }
          const cat = CURRICULUM.find((c) => c.templates.some((t) => t.id === next.id))
          return { ok: true, next: { id: next.id, name: next.name, category: cat?.name ?? '', difficulty: next.difficulty } }
        }

        case 'set_status': {
          const id = args.templateId as string
          const status = args.status as string
          if (!TEMPLATE_STATUSES.includes(status as never)) return { ok: false, error: "status 需为 'todo' | 'learning' | 'mastered'" }
          if (!isTemplateId(id)) return { ok: false, error: `课程中不存在模板 ${id}` }
          store.setTemplateProgress(id, { status: status as never, masteredAt: status === 'mastered' ? new Date().toISOString() : null })
          return { ok: true }
        }

        case 'set_note': {
          const id = args.templateId as string
          const note = args.note
          if (typeof note !== 'string') return { ok: false, error: 'note 需为字符串' }
          if (!isTemplateId(id)) return { ok: false, error: `课程中不存在模板 ${id}` }
          store.setTemplateProgress(id, { note: note.trim() === '' ? null : note })
          return { ok: true }
        }

        case 'set_content': {
          const id = args.templateId as string
          if (!isTemplateId(id)) return { ok: false, error: `课程中不存在模板 ${id}` }
          const code = typeof args.code === 'string' ? args.code : ''
          if (code.length > 20000) return { ok: false, error: 'code 过长' }
          store.setTemplateProgress(id, {
            code: code || null,
            idea: typeof args.idea === 'string' ? args.idea.slice(0, 5000) || null : null,
            complexity: typeof args.complexity === 'string' ? args.complexity.slice(0, 200) || null : null,
            url: typeof args.url === 'string' && args.url.trim() ? args.url.trim().slice(0, 500) : null,
          })
          return { ok: true, hasContent: code.trim() !== '' || (typeof args.idea === 'string' && args.idea.trim() !== '') }
        }

        case 'create_custom': {
          const v = validateCustomBody(args)
          if ('error' in v) return { ok: false, error: v.error }
          const record = store.createCustomTemplate({
            categoryKey: v.categoryKey, name: v.name, difficulty: v.difficulty,
            tags: v.tags, code: v.code, idea: v.idea || null, complexity: v.complexity || null, url: v.url,
          })
          return { ok: true, id: customId(record.id) }
        }

        case 'update_custom': {
          const dbId = Number(args.customId)
          if (!Number.isInteger(dbId)) return { ok: false, error: 'customId 必填' }
          if (!store.getCustomTemplate(dbId)) return { ok: false, error: '自建模板不存在' }
          const v = validateCustomBody(args)
          if ('error' in v) return { ok: false, error: v.error }
          store.updateCustomTemplate(dbId, {
            categoryKey: v.categoryKey, name: v.name, difficulty: v.difficulty,
            tags: v.tags, code: v.code, idea: v.idea || null, complexity: v.complexity || null, url: v.url,
          })
          return { ok: true }
        }

        case 'delete_custom': {
          const dbId = Number(args.customId)
          if (!Number.isInteger(dbId)) return { ok: false, error: 'customId 必填' }
          if (!store.deleteCustomTemplate(dbId)) return { ok: false, error: '自建模板不存在' }
          return { ok: true }
        }

        case 'collect_example': {
          const platform = args.platform as PlatformId
          const key = typeof args.key === 'string' ? args.key.trim() : ''
          if (!platform || !['codeforces', 'atcoder'].includes(platform)) return { ok: false, error: 'platform 非法' }
          if (!key) return { ok: false, error: 'key 必填' }
          const title = typeof args.title === 'string' && args.title ? args.title : key
          store.upsertBankProblems([{
            platform, problemKey: key, title,
            difficulty: null,
            url: typeof args.url === 'string' && args.url ? args.url : null,
            tags: Array.isArray(args.tags) ? args.tags.map(String).filter(Boolean) : [],
          }])
          return { ok: true }
        }

        case 'sync_examples': {
          const templateId = args.templateId as string
          if (!templateId) return { ok: false, error: 'templateId 必填' }
          const item = CURRICULUM.flatMap((cat) => cat.templates).find((t) => t.id === templateId)
          if (!item || item.examples.length === 0) return { ok: false, error: `模板 ${templateId} 不存在或没有例题` }
          const results = []
          for (const platform of new Set(item.examples.map((ex) => ex.platform as PlatformId))) {
            const account = store.getAccount(platform)
            if (!account?.handle) {
              results.push({ platform, handle: null, imported: 0, skipped: 0, errors: [`未绑定 ${platform} 账号`] })
              continue
            }
            const r = await syncPlatform(host, platform, account.handle)
            results.push({ ...r, handle: account.handle })
          }
          return { ok: true, results }
        }

        default:
          return { ok: false, error: `未知 action: ${action}` }
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `模板：${args.action}` }),
  }))
}

function validateCustomBody(body: Record<string, unknown>):
  | { error: string }
  | { name: string; categoryKey: string; difficulty: number; tags: string[]; code: string; idea: string; complexity: string; url: string | null } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100) return { error: 'name 必填且不超过 100 字' }
  const categoryKey = body.categoryKey
  if (typeof categoryKey !== 'string' || !CURRICULUM.some((c) => c.key === categoryKey)) return { error: 'categoryKey 需为课程分类之一' }
  const difficulty = Number(body.difficulty)
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return { error: 'difficulty 需为 1-5 整数' }
  const tags = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean).slice(0, 12) : []
  const code = typeof body.code === 'string' ? body.code : ''
  if (code.length > 20000) return { error: 'code 过长' }
  const idea = typeof body.idea === 'string' ? body.idea.slice(0, 5000) : ''
  const complexity = typeof body.complexity === 'string' ? body.complexity.slice(0, 200) : ''
  const url = typeof body.url === 'string' && body.url.trim() !== '' ? body.url.trim() : null
  return { name, categoryKey, difficulty, tags, code, idea, complexity, url }
}
