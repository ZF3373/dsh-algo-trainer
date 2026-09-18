import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentLike, Context } from './dsh-compat.ts'
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
