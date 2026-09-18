# ICPC Workbench Sidebar and On-demand Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-to-open ICPC Workbench right sidebar and expose the existing training tools only after explicit activation in the current Harness session.

**Architecture:** The client registers one header action and one keyed right-sidebar tab. Feature clicks POST to a Host route, which resolves the current Agent and registers the existing `icpc_*` tools into `agent.ctx`. Nothing is registered globally, so unrelated sessions never see the tools or their prompt schemas.

**Tech Stack:** TypeScript, Cordis, DeepSeek Harness Client Slots, `sidebarRightTabs`, React, Node `node:http`, inline SVG glyphs, `tsx --test`, tsdown.

**Spec:** `docs/superpowers/specs/2026-09-18-sidebar-launcher-design.md`

## Global Constraints

- Do not register `icpc_*` tools globally during plugin load.
- Opening the sidebar must not activate the tools.
- Activation is per live Agent/session through `agent.ctx`.
- The AI assistant entry activates the session but does not overwrite or submit an existing draft.
- Existing training tool behavior and JSON persistence remain unchanged.
- Use Harness theme variables for the panel; do not add a second chat UI.
- Client bundle must remain wrapped as `window.__ModuleLoader__.load(...)`.
- Use `apply_patch` for source edits.

---

### Task 1: Make Tool Registrars Return Disposers

**Files:**
- Modify: `src/tools/sync.ts`
- Modify: `src/tools/stats.ts`
- Modify: `src/tools/today.ts`
- Modify: `src/tools/plans.ts`
- Modify: `src/tools/reviews.ts`
- Modify: `src/tools/templates.ts`
- Modify: `src/tools/contests.ts`
- Modify: `src/tools/checkins.ts`
- Modify: `src/tools/settings.ts`
- Modify: `src/tools/import.ts`
- Modify: `src/tools/problems.ts`
- Modify: `src/tools/export.ts`
- Create: `src/activation.ts`
- Create: `tests/activation.test.ts`

**Interfaces:**
- Consumes: existing `registerXTool(host, ctx)` functions.
- Produces: every `registerXTool` returns `() => void`.
- Produces: `ICPC_TOOL_NAMES: readonly string[]`.
- Produces: `registerIcpcTools(host: IcpcHost, targetCtx: Context): () => void`.

- [ ] **Step 1: Write the failing activation registration test**

Create `tests/activation.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../src/dsh-compat.ts'
import type { IcpcHost } from '../src/index.ts'
import { ICPC_TOOL_NAMES, registerIcpcTools } from '../src/activation.ts'

describe('registerIcpcTools', () => {
  it('registers every ICPC tool and disposes each registration once', () => {
    const registered: string[] = []
    const disposed: string[] = []
    const targetCtx = {
      tools: {
        register(tool: { name: string }) {
          registered.push(tool.name)
          return () => {
            disposed.push(tool.name)
          }
        },
      },
    } as unknown as Context

    const dispose = registerIcpcTools({} as IcpcHost, targetCtx)

    assert.equal(registered.length, 13)
    assert.deepEqual(new Set(registered), new Set(ICPC_TOOL_NAMES))
    assert.equal(disposed.length, 0)
    dispose()
    assert.equal(disposed.length, 13)
    assert.deepEqual(new Set(disposed), new Set(ICPC_TOOL_NAMES))
    dispose()
    assert.equal(disposed.length, 13)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test tests/activation.test.ts
```

Expected: FAIL because `src/activation.ts` does not exist.

- [ ] **Step 3: Change each tool registrar to return its disposer**

For single-tool files (`sync.ts`, `stats.ts`, `today.ts`, `reviews.ts`,
`templates.ts`, `contests.ts`, `checkins.ts`, `settings.ts`, `import.ts`,
`problems.ts`, `export.ts`), change the function return type from `void` to
`() => void`, then return the `ctx.tools.register(...)` result.

Use this exact pattern in `src/tools/stats.ts`:

```ts
export function registerStatsTool(host: IcpcHost, ctx: Context): () => void {
  return ctx.tools.register(defineTool({
    name: 'icpc_stats',
    // existing definition unchanged
  }))
}
```

For `src/tools/plans.ts`, capture both registrations:

```ts
export function registerPlanTools(host: IcpcHost, ctx: Context): () => void {
  const disposeGenerate = ctx.tools.register(defineTool({
    name: 'icpc_generate_plan',
    // existing definition unchanged
  }))
  const disposeManage = ctx.tools.register(defineTool({
    name: 'icpc_manage_plan',
    // existing definition unchanged
  }))
  return () => {
    disposeGenerate()
    disposeManage()
  }
}
```

Apply the same return-disposer change to every listed single-tool file.

- [ ] **Step 4: Create `src/activation.ts` with the combined registrar**

```ts
import type { Context } from './dsh-compat.ts'
import type { IcpcHost } from './index.ts'
import { registerSyncTool } from './tools/sync.ts'
import { registerStatsTool } from './tools/stats.ts'
import { registerTodayTool } from './tools/today.ts'
import { registerPlanTools } from './tools/plans.ts'
import { registerReviewTool } from './tools/reviews.ts'
import { registerTemplateTool } from './tools/templates.ts'
import { registerContestTool } from './tools/contests.ts'
import { registerCheckinTool } from './tools/checkins.ts'
import { registerSettingsTool } from './tools/settings.ts'
import { registerImportTool } from './tools/import.ts'
import { registerProblemTool } from './tools/problems.ts'
import { registerExportTool } from './tools/export.ts'

export const ICPC_TOOL_NAMES = [
  'icpc_sync',
  'icpc_stats',
  'icpc_today',
  'icpc_generate_plan',
  'icpc_manage_plan',
  'icpc_review',
  'icpc_templates',
  'icpc_contests',
  'icpc_checkin',
  'icpc_settings',
  'icpc_import',
  'icpc_problems',
  'icpc_export',
] as const

export function registerIcpcTools(host: IcpcHost, targetCtx: Context): () => void {
  const disposers = [
    registerSyncTool(host, targetCtx),
    registerStatsTool(host, targetCtx),
    registerTodayTool(host, targetCtx),
    registerPlanTools(host, targetCtx),
    registerReviewTool(host, targetCtx),
    registerTemplateTool(host, targetCtx),
    registerContestTool(host, targetCtx),
    registerCheckinTool(host, targetCtx),
    registerSettingsTool(host, targetCtx),
    registerImportTool(host, targetCtx),
    registerProblemTool(host, targetCtx),
    registerExportTool(host, targetCtx),
  ]

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
```

Note: `ICPC_TOOL_NAMES` has 13 names because `registerPlanTools` contributes
two tools and the remaining registrars contribute one each.

- [ ] **Step 5: Run the activation registration test**

Run:

```bash
npx tsx --test tests/activation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all host tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools src/activation.ts tests/activation.test.ts
git commit -m "refactor: scope ICPC tool registration"
```

---

### Task 2: Add Session Activation and the Host Route

**Files:**
- Modify: `src/dsh-compat.ts`
- Modify: `src/activation.ts`
- Modify: `tests/activation.test.ts`

**Interfaces:**
- Consumes: `registerIcpcTools(host, targetCtx)`.
- Produces: `ActivationError`.
- Produces: `createSessionActivator(ctx, host): SessionActivator`.
- Produces: `registerActivationRoute(ctx, host): void`.

- [ ] **Step 1: Add failing tests for session activation**

Append to `tests/activation.test.ts`:

```ts
import { createSessionActivator } from '../src/activation.ts'
import type { AgentLike } from '../src/dsh-compat.ts'

describe('createSessionActivator', () => {
  function fixture() {
    const registered: string[] = []
    const disposed: string[] = []
    const listeners: Array<(payload: { agent?: AgentLike }) => void> = []
    const toolCtx = {
      tools: {
        register(tool: { name: string }) {
          registered.push(tool.name)
          return () => disposed.push(tool.name)
        },
      },
    } as unknown as Context
    const agent: AgentLike = { id: 'session-1', ctx: toolCtx }
    const ctx = {
      agents: {
        get(id: string) {
          return id === agent.id ? agent : undefined
        },
      },
      on(_event: string, handler: (payload: { agent?: AgentLike }) => void) {
        listeners.push(handler)
        return () => {}
      },
    } as unknown as Context
    return { ctx, agent, registered, disposed, listeners }
  }

  it('activates an existing agent once', () => {
    const { ctx, registered } = fixture()
    const activator = createSessionActivator(ctx, {} as IcpcHost)

    assert.deepEqual(activator.activate('session-1').tools, [...ICPC_TOOL_NAMES])
    assert.equal(registered.length, 13)
    activator.activate('session-1')
    assert.equal(registered.length, 13)
  })

  it('rejects a missing live agent', () => {
    const { ctx } = fixture()
    const activator = createSessionActivator(ctx, {} as IcpcHost)

    assert.throws(
      () => activator.activate('missing'),
      (error: unknown) => error instanceof Error && /live agent/i.test(error.message),
    )
  })

  it('releases registrations when the agent is disposed', () => {
    const { ctx, agent, disposed, listeners } = fixture()
    const activator = createSessionActivator(ctx, {} as IcpcHost)
    activator.activate(agent.id)

    listeners[0]?.({ agent })
    assert.equal(disposed.length, 13)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test tests/activation.test.ts
```

Expected: FAIL because `createSessionActivator` is not exported.

- [ ] **Step 3: Extend Host compatibility types**

In `src/dsh-compat.ts`, add:

```ts
export interface AgentLike {
  id: string
  ctx: Context
}

export interface AgentsService {
  get(id: string): AgentLike | undefined
}

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void | Promise<void>
}

export interface WebServerService {
  register(route: WebRoute): () => void
}
```

Add optional services to `Context`:

```ts
export interface Context {
  tools: ToolsService
  agents?: AgentsService
  webServer?: WebServerService
  fs?: FsService
  rpc?: RpcService
  effect: (fn: () => void | (() => void)) => void
  on: (event: string, handler: (...args: unknown[]) => unknown) => () => void
  emit: (event: string, ...args: unknown[]) => void
}
```

- [ ] **Step 4: Implement the session activator**

Append to `src/activation.ts`:

```ts
import type { AgentLike } from './dsh-compat.ts'

export class ActivationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ActivationError'
  }
}

export interface ActivationResult {
  sessionId: string
  tools: readonly string[]
}

export interface SessionActivator {
  activate(sessionId: string): ActivationResult
  dispose(): void
}

export function createSessionActivator(ctx: Context, host: IcpcHost): SessionActivator {
  const active = new Map<string, { agent: AgentLike; dispose: () => void }>()
  const offDisposed = ctx.on('agent/disposed', (...args: unknown[]) => {
    const payload = args[0] as { agent?: AgentLike } | undefined
    const agent = payload?.agent
    if (!agent) return
    const entry = active.get(agent.id)
    if (entry?.agent !== agent) return
    entry.dispose()
    active.delete(agent.id)
  })

  return {
    activate(sessionId) {
      const id = sessionId.trim()
      if (!id) throw new ActivationError('sessionId is required', 400, 'invalid-session-id')
      if (!ctx.agents) throw new ActivationError('agent service is unavailable', 503, 'agents-unavailable')

      const agent = ctx.agents.get(id)
      if (!agent) throw new ActivationError(`live agent not found for session ${id}`, 409, 'agent-not-found')

      const existing = active.get(id)
      if (existing?.agent === agent) return { sessionId: id, tools: ICPC_TOOL_NAMES }
      existing?.dispose()

      const dispose = registerIcpcTools(host, agent.ctx)
      active.set(id, { agent, dispose })
      return { sessionId: id, tools: ICPC_TOOL_NAMES }
    },
    dispose() {
      offDisposed()
      for (const entry of active.values()) entry.dispose()
      active.clear()
    },
  }
}
```

- [ ] **Step 5: Run the activation tests**

Run:

```bash
npx tsx --test tests/activation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Implement the HTTP route**

Append to `src/activation.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http'

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function trustedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers.host
  return origin === `http://${host}` || origin === `https://${host}`
}

export function registerActivationRoute(ctx: Context, host: IcpcHost): void {
  if (!ctx.webServer) throw new Error('webServer service is required for ICPC activation')
  const activator = createSessionActivator(ctx, host)

  ctx.effect(() => {
    const offRoute = ctx.webServer!.register({
      kind: 'exact',
      path: '/icpc-workbench/activate',
      async handler(req, res) {
        if (req.method !== 'POST') {
          res.setHeader('allow', 'POST')
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        if (!trustedOrigin(req)) {
          sendJson(res, 403, { ok: false, error: 'origin-not-allowed' })
          return
        }
        if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
          sendJson(res, 415, { ok: false, error: 'json-required' })
          return
        }

        try {
          const body = await readJson(req) as { sessionId?: unknown }
          if (typeof body.sessionId !== 'string') {
            throw new ActivationError('sessionId is required', 400, 'invalid-session-id')
          }
          sendJson(res, 200, { ok: true, ...activator.activate(body.sessionId) })
        } catch (error) {
          if (error instanceof ActivationError) {
            sendJson(res, error.status, { ok: false, error: error.code, message: error.message })
            return
          }
          sendJson(res, 400, { ok: false, error: 'invalid-request', message: String(error) })
        }
      },
    })

    return () => {
      offRoute()
      activator.dispose()
    }
  })
}
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/dsh-compat.ts src/activation.ts tests/activation.test.ts
git commit -m "feat: add session-scoped ICPC activation"
```

---

### Task 3: Wire the Host Plugin to the Activation Route

**Files:**
- Modify: `src/index.ts`
- Test: `tests/activation.test.ts`

**Interfaces:**
- Consumes: `registerActivationRoute(ctx, host)`.
- Produces: Host plugin `inject = ['tools', 'agents', 'webServer']`.
- Produces: no global `registerXTool` calls during `apply`.

- [ ] **Step 1: Add a source-level regression test**

Append to `tests/activation.test.ts`:

```ts
import { readFile } from 'node:fs/promises'

describe('host plugin wiring', () => {
  it('does not register training tools globally in apply', async () => {
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    assert.match(source, /registerActivationRoute\(ctx, host\)/)
    assert.doesNotMatch(source, /registerSyncTool\(host, ctx\)/)
    assert.doesNotMatch(source, /registerStatsTool\(host, ctx\)/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test tests/activation.test.ts
```

Expected: FAIL because `src/index.ts` still registers tools globally.

- [ ] **Step 3: Update `src/index.ts`**

Replace the individual tool imports with:

```ts
import { registerActivationRoute } from './activation.ts'
```

Change:

```ts
export const inject = ['tools']
```

to:

```ts
export const inject = ['tools', 'agents', 'webServer']
```

Replace the global tool registration block:

```ts
registerSyncTool(host, ctx)
registerStatsTool(host, ctx)
registerTodayTool(host, ctx)
registerPlanTools(host, ctx)
registerReviewTool(host, ctx)
registerTemplateTool(host, ctx)
registerContestTool(host, ctx)
registerCheckinTool(host, ctx)
registerSettingsTool(host, ctx)
registerImportTool(host, ctx)
registerProblemTool(host, ctx)
registerExportTool(host, ctx)
```

with:

```ts
registerActivationRoute(ctx, host)
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/activation.test.ts
git commit -m "feat: activate ICPC tools per session"
```

---

### Task 4: Add the Client Feature Catalog

**Files:**
- Create: `client/features.ts`
- Create: `tests/client-features.test.ts`

**Interfaces:**
- Produces: `FeatureGroup`, `FeatureIcon`, `WorkbenchFeature`.
- Produces: `FEATURE_GROUPS`.
- Produces: `WORKBENCH_FEATURES`.
- Produces: `featurePrompt(id: string): string`.

- [ ] **Step 1: Write the failing feature-catalog test**

Create `tests/client-features.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FEATURE_GROUPS,
  WORKBENCH_FEATURES,
  featurePrompt,
} from '../client/features.ts'

describe('workbench features', () => {
  it('has unique ids and only known groups', () => {
    const ids = WORKBENCH_FEATURES.map((feature) => feature.id)
    assert.equal(new Set(ids).size, ids.length)
    const groups = new Set(FEATURE_GROUPS.map((group) => group.id))
    for (const feature of WORKBENCH_FEATURES) assert.ok(groups.has(feature.group))
  })

  it('maps every non-assistant feature to a tool prompt', () => {
    for (const feature of WORKBENCH_FEATURES) {
      if (feature.id === 'assistant') continue
      assert.match(featurePrompt(feature.id), /icpc_/)
    }
  })

  it('rejects the assistant prompt lookup', () => {
    assert.throws(() => featurePrompt('assistant'), /no prompt/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test tests/client-features.test.ts
```

Expected: FAIL because `client/features.ts` does not exist.

- [ ] **Step 3: Create `client/features.ts`**

```ts
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
```

- [ ] **Step 4: Run the feature test**

Run:

```bash
npx tsx --test tests/client-features.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/features.ts tests/client-features.test.ts
git commit -m "feat: define ICPC workbench feature catalog"
```

---

### Task 5: Build the Right-sidebar UI and Header Button

**Files:**
- Create: `client/api.ts`
- Create: `client/WorkbenchPanel.tsx`
- Modify: `client/index.ts`
- Modify: `package.json`
- Modify: `tsdown.config.ts`

**Interfaces:**
- Consumes: `WORKBENCH_FEATURES`, `FEATURE_GROUPS`, `featurePrompt`.
- Produces: `activateWorkbench(sessionId: string): Promise<ActivationResponse>`.
- Produces: `WorkbenchPanel`.
- Produces: `HeaderAction`.
- Produces: registrations for `conversation.session.header.actions`, `sidebarRightTabs`, and `sidebar.right.pane.tab`.

- [ ] **Step 1: Add the client activation fetch helper**

Create `client/api.ts`:

```ts
export interface ActivationResponse {
  ok: true
  sessionId: string
  tools: string[]
}

interface ErrorResponse {
  ok?: false
  error?: string
  message?: string
}

export async function activateWorkbench(sessionId: string): Promise<ActivationResponse> {
  const response = await fetch('/icpc-workbench/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const body = await response.json().catch(() => null) as ActivationResponse | ErrorResponse | null
  if (!response.ok || !body || body.ok !== true) {
    const failure = body as ErrorResponse | null
    throw new Error(failure?.message ?? failure?.error ?? `activation failed (${response.status})`)
  }
  return body
}
```

- [ ] **Step 2: Add the right-sidebar component**

Create `client/WorkbenchPanel.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { activateWorkbench } from './api.ts'
import {
  FEATURE_GROUPS,
  WORKBENCH_FEATURES,
  featurePrompt,
  type FeatureIcon,
  type WorkbenchFeature,
} from './features.ts'

export interface InputActions {
  setDraft(text: string): void
  submit(): void
}

export interface WorkbenchPanelProps {
  sessionId?: string
  inputActions?: InputActions
  collapseSidebar?: () => void
}

export function WorkbenchPanel({
  sessionId,
  inputActions,
  collapseSidebar,
}: WorkbenchPanelProps): ReactNode {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runFeature(feature: WorkbenchFeature): Promise<void> {
    if (!sessionId) {
      setError('当前会话不可用')
      return
    }
    if (!inputActions) {
      setError('Harness 输入框不可用')
      return
    }

    setBusy(feature.id)
    setError(null)
    try {
      await activateWorkbench(sessionId)
      if (feature.id === 'assistant') {
        collapseSidebar?.()
        return
      }
      inputActions.setDraft(featurePrompt(feature.id))
      queueMicrotask(() => inputActions.submit())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="icpc-workbench">
      <style>{PANEL_CSS}</style>
      <header className="icpc-workbench__header">
        <div className="icpc-workbench__mark">
          <Trophy size={16} aria-hidden="true" />
        </div>
        <div>
          <h2>ICPC Workbench</h2>
          <p>训练工作台</p>
        </div>
      </header>

      {error ? <div className="icpc-workbench__error" role="alert">{error}</div> : null}

      <div className="icpc-workbench__groups">
        {FEATURE_GROUPS.map((group) => (
          <section className="icpc-workbench__group" key={group.id}>
            <h3>{group.label}</h3>
            <div className="icpc-workbench__items">
              {WORKBENCH_FEATURES.filter((feature) => feature.group === group.id).map((feature) => {
                const Icon = ICONS[feature.icon]
                return (
                  <button
                    className="icpc-workbench__item"
                    type="button"
                    key={feature.id}
                    disabled={busy !== null}
                    onClick={() => void runFeature(feature)}
                  >
                  <span className="icpc-workbench__icon"><Icon name={feature.icon} size={17} /></span>
                    <span className="icpc-workbench__copy">
                      <span className="icpc-workbench__label">{feature.label}</span>
                      <span className="icpc-workbench__description">{feature.description}</span>
                    </span>
                    <span className="icpc-workbench__status" aria-hidden="true">
                      {busy === feature.id ? '…' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export interface HeaderActionProps {
  open: () => void
}

export function HeaderAction({ open }: HeaderActionProps): ReactNode {
  return (
    <button
      className="icpc-header-action"
      type="button"
      title="打开 ICPC Workbench"
      aria-label="打开 ICPC Workbench"
      onClick={open}
    >
      <Icon name="trophy" size={16} />
    </button>
  )
}

const PANEL_CSS = `
.icpc-workbench {
  box-sizing: border-box;
  min-height: 100%;
  padding: 14px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  font: inherit;
}
.icpc-workbench__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.icpc-workbench__mark {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover);
  border-radius: 8px;
}
.icpc-workbench h2,
.icpc-workbench h3,
.icpc-workbench p {
  margin: 0;
}
.icpc-workbench h2 {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}
.icpc-workbench__header p {
  margin-top: 2px;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
}
.icpc-workbench__groups {
  display: grid;
  gap: 18px;
}
.icpc-workbench__group h3 {
  margin: 0 0 7px;
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
}
.icpc-workbench__items {
  display: grid;
  gap: 4px;
}
.icpc-workbench__item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 7px 8px;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}
.icpc-workbench__item:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  border-color: var(--dsw-alias-border-l4);
}
.icpc-workbench__item:disabled {
  cursor: default;
  opacity: .6;
}
.icpc-workbench__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--dsw-alias-label-secondary);
}
.icpc-workbench__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.icpc-workbench__label,
.icpc-workbench__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icpc-workbench__label {
  font-size: 13px;
  line-height: 1.35;
}
.icpc-workbench__description {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 1.35;
}
.icpc-workbench__status {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  text-align: center;
}
.icpc-workbench__error {
  margin-bottom: 12px;
  padding: 8px 10px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));
  border: 1px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  font-size: 12px;
}
.icpc-header-action {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.icpc-header-action:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
`
```

Implement `Icon` as a small internal SVG component switching on the feature icon
name. Do not add `lucide-react`; the plugin must build without fetching a new
runtime dependency.

- [ ] **Step 3: Rewrite `client/index.ts` registrations**

Use these exports and registration calls:

```ts
import { WorkbenchPanel, HeaderAction } from './WorkbenchPanel.tsx'

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
```

Keep the existing `SettingsPanel` and `getReact` implementation below this
code unchanged.

- [ ] **Step 4: Update client manifest and externalization**

Change the DSH client manifest:

```json
"client": {
  "platform": "web",
  "inject": [
    "@deepseek-ai/dsh-client-ui-conversation",
    "@deepseek-ai/dsh-client-ui-slots",
    "@deepseek-ai/dsh-client-ui-sidebar-right"
  ],
  "external": []
}
```

In `tsdown.config.ts`, extend `neverBundle`:

```ts
neverBundle: [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/schemastery',
  'react',
  'react-dom',
  'react/jsx-runtime',
],
```

- [ ] **Step 5: Run client checks**

Run:

```bash
npm run typecheck:client
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Verify the built client contains all required registrations**

Run:

```bash
Select-String -Path lib/client.mjs -Pattern '__ModuleLoader__|conversation.session.header.actions|sidebarRightTabs|sidebar.right.pane.tab|settings.section'
```

Expected: the file contains every pattern.

- [ ] **Step 7: Commit**

```bash
git add client package.json tsdown.config.ts
git commit -m "feat: add ICPC workbench sidebar"
```

---

### Task 6: Document and Verify the Final Behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-18-sidebar-launcher-design.md` only if implementation reveals a factual mismatch.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: user-facing installation and activation documentation.

- [ ] **Step 1: Update `README.md`**

Add a section after `## Client 面板`:

```md
## 侧边栏与按需激活

插件在会话头部注册 `ICPC Workbench` 按钮。点击后打开 Harness 右侧栏，
侧栏按“训练”和“记录与设置”分组展示现有能力。

打开侧栏不会向 Agent 注入任何 ICPC 工具或提示词。只有用户在当前会话点击
“AI 助手”或某个具体功能项后，插件才会把 `icpc_*` 工具注册到该会话对应的
Agent 作用域，并由 Harness 当前对话执行后续请求。其他会话不受影响。
```

- [ ] **Step 2: Run the full verification suite**

Run:

```bash
npm run typecheck
npm run typecheck:client
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Verify no global tool registration remains**

Run:

```bash
rg -n "registerSyncTool\(host, ctx\)|registerStatsTool\(host, ctx\)|registerTodayTool\(host, ctx\)" src/index.ts
```

Expected: no matches.

- [ ] **Step 4: Verify no ICPC tool names appear in a fresh session before activation**

Manual check in Harness:

1. Open a new session.
2. Do not open the ICPC sidebar.
3. Ask the model to list available tools.
4. Expected: no `icpc_*` tool appears.

- [ ] **Step 5: Verify per-session activation**

Manual check in Harness:

1. Open the ICPC header button.
2. Click `数据概览`.
3. Expected: the current session gets the ICPC tool schemas and submits the
   overview prompt.
4. Open a second session.
5. Ask it to list available tools.
6. Expected: the second session has no `icpc_*` tools.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-18-sidebar-launcher-design.md
git commit -m "docs: explain on-demand ICPC activation"
```
