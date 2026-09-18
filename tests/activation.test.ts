import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentLike, Context } from '../src/dsh-compat.ts'
import type { IcpcHost } from '../src/index.ts'
import {
  ICPC_TOOL_NAMES,
  createSessionActivator,
  registerIcpcTools,
} from '../src/activation.ts'

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
