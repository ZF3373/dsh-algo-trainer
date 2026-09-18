export const BETTER_SIDEBAR_TAB_ID = 'dsh-algo-trainer:workbench'

export interface BetterSidebarSessionScope {
  sessionId: string
}

export interface BetterSidebarTabDescriptorLike {
  id: string
  title: string | (() => string)
  description?: string | (() => string)
  icon?: unknown
  order?: number
  single?: boolean
  component: unknown
}

export interface BetterSidebarServiceLike {
  registerTab(descriptor: BetterSidebarTabDescriptorLike): () => void
  openTab(seed: { type: string }, scope?: BetterSidebarSessionScope): void
}

export interface InputActionsLike {
  setDraft(text: string): void
  submit(): void
}

interface SidebarSessionInputLike {
  setDraft(text: string): void
}

interface SidebarConversationLike {
  input: {
    for(actx: unknown): SidebarSessionInputLike
  }
}

interface SessionsLike {
  scope(sessionId: string): unknown
}

export interface ConversationContextLike {
  get?(name: string): unknown
}

export function createBetterSidebarDescriptor(
  component: unknown,
  icon: unknown,
): BetterSidebarTabDescriptorLike {
  return {
    id: BETTER_SIDEBAR_TAB_ID,
    title: () => 'ICPC Workbench',
    description: () => '训练工作台',
    icon,
    order: 60,
    single: true,
    component,
  }
}

export function openBetterSidebarTab(
  service: BetterSidebarServiceLike,
  sessionId: string,
): void {
  service.openTab({ type: BETTER_SIDEBAR_TAB_ID }, { sessionId })
}

export function createConversationInputActions(
  ctx: ConversationContextLike,
  sessionId: string,
): InputActionsLike | undefined {
  const conversation = ctx.get?.('conversation') as SidebarConversationLike | undefined
  const sessions = ctx.get?.('sessions') as SessionsLike | undefined
  const actx = sessions?.scope?.(sessionId)
  if (!conversation || !actx) return undefined

  return {
    setDraft(text) {
      conversation.input.for(actx).setDraft(text)
    },
    submit() {
      const click = (): void => {
        if (typeof document === 'undefined') return
        const labels = ['发送消息', 'Send message']
        const button = Array.from(document.querySelectorAll('button')).find((candidate) => {
          const label = candidate.getAttribute('aria-label') ?? candidate.getAttribute('title') ?? ''
          return labels.includes(label.trim())
        })
        if (button instanceof HTMLButtonElement && !button.disabled) button.click()
      }
      setTimeout(click, 0)
    },
  }
}
