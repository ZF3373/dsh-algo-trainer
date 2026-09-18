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
