import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BETTER_SIDEBAR_TAB_ID,
  createBetterSidebarDescriptor,
  createConversationInputActions,
  openBetterSidebarTab,
} from '../client/betterSidebar.ts'

describe('better-sidebar adapter', () => {
  it('describes a single reusable ICPC tab', () => {
    const descriptor = createBetterSidebarDescriptor('component', 'icon')
    assert.equal(descriptor.id, BETTER_SIDEBAR_TAB_ID)
    assert.equal(descriptor.single, true)
    assert.equal(descriptor.order, 60)
    assert.equal(typeof descriptor.title, 'function')
    assert.equal(descriptor.title(), 'ICPC Workbench')
  })

  it('opens the tab for the requested session', () => {
    const calls: unknown[] = []
    openBetterSidebarTab({
      registerTab() {
        return () => {}
      },
      openTab(seed, scope) {
        calls.push({ seed, scope })
      },
    }, 'session-1')
    assert.deepEqual(calls, [{
      seed: { type: BETTER_SIDEBAR_TAB_ID },
      scope: { sessionId: 'session-1' },
    }])
  })

  it('writes feature prompts through the conversation service', () => {
    const drafts: string[] = []
    const actx = { sessionId: 'session-1' }
    const inputActions = createConversationInputActions({
      get(name) {
        if (name === 'sessions') return { scope: () => actx }
        if (name === 'conversation') {
          return { input: { for: () => ({ setDraft: (text: string) => drafts.push(text) }) } }
        }
        return undefined
      },
    }, 'session-1')

    assert.ok(inputActions)
    inputActions.setDraft('icpc prompt')
    assert.deepEqual(drafts, ['icpc prompt'])
  })
})
