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
