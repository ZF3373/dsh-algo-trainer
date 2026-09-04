import type { IcpcHost } from '../index.ts'
import type { Context, ToolDefinition } from '../dsh-compat.ts'
import { defineTool } from '../dsh-compat.ts'
import { textOutput, ANY_OUTPUT, str, num } from './helpers.ts'
import { bucketForDifficulty } from '../store/index.ts'

export function registerProblemTool(host: IcpcHost, ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'icpc_problems',
    description:
      '浏览/搜索题目库。支持 platform/difficulty/tag/q 关键词过滤。' +
      'bank=1 包含题库拉取的未做题，默认只显示做过有提交记录的题。',
    parameters: {
      platform: { type: 'string', enum: ['codeforces', 'atcoder'] },
      difficulty: {
        type: 'string',
        description: '难度桶：<1200 / 1200-1399 / 1400-1599 / 1600-1899 / 1900-2199 / 2200+',
      },
      tag: { type: 'string', description: '筛选标签' },
      q: { type: 'string', description: '搜索关键词（匹配标题或题号）' },
      bank: { type: 'boolean', description: '是否包含未做题（默认 false 只显示做过的）' },
      limit: { type: 'number', description: '返回上限（默认 300）' },
    },
    output: { schema: ANY_OUTPUT, render: (_a, v) => textOutput(v) },
    async execute(args) {
      const platform = str(args.platform) as 'codeforces' | 'atcoder' | undefined
      const result = host.store.browseProblems({
        platform,
        difficulty: str(args.difficulty),
        tag: str(args.tag),
        q: str(args.q),
        bank: args.bank === true,
        limit: num(args.limit, 300, 1, 5000),
      })
      return { ok: true, problems: result }
    },
    presentCall: (args) => ({ card: 'generic', title: '题目浏览' }),
  }))
}
