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

    setBusy(feature.id)
    setError(null)
    try {
      await activateWorkbench(sessionId)
      if (feature.id === 'assistant') {
        collapseSidebar?.()
        return
      }
      if (!inputActions) {
        setError('Harness 输入框不可用')
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
          <Icon name="trophy" size={16} />
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
              {WORKBENCH_FEATURES.filter((feature) => feature.group === group.id).map((feature) => (
                <button
                  className="icpc-workbench__item"
                  type="button"
                  key={feature.id}
                  disabled={busy !== null || !sessionId || (!inputActions && feature.id !== 'assistant')}
                  onClick={() => void runFeature(feature)}
                >
                  <span className="icpc-workbench__icon">
                    <Icon name={feature.icon} size={17} />
                  </span>
                  <span className="icpc-workbench__copy">
                    <span className="icpc-workbench__label">{feature.label}</span>
                    <span className="icpc-workbench__description">{feature.description}</span>
                  </span>
                  <span className="icpc-workbench__status" aria-hidden="true">
                    {busy === feature.id ? '…' : ''}
                  </span>
                </button>
              ))}
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

export function WorkbenchGlyph({ size = 16 }: { size?: number }): ReactNode {
  return <Icon name="trophy" size={size} />
}

function Icon({ name, size = 16 }: { name: FeatureIcon | 'trophy'; size?: number }): ReactNode {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'assistant':
      return <svg {...common}><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" /></svg>
    case 'overview':
      return <svg {...common}><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
    case 'today':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4V2M20 12h2M12 20v2M4 12H2" /></svg>
    case 'plans':
      return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
    case 'reviews':
      return <svg {...common}><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 12a8 8 0 0 1 13.7-5.6L20 8.5" /><path d="M4 20v-4.5h4.5M20 4v4.5h-4.5" /></svg>
    case 'templates':
      return <svg {...common}><path d="m9 18-6-6 6-6M15 6l6 6-6 6M14 4l-4 16" /></svg>
    case 'problems':
      return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
    case 'sync':
      return <svg {...common}><path d="M20 7h-5V2M4 17h5v5" /><path d="M18.4 16A7 7 0 0 1 6 18l-2-1M5.6 8A7 7 0 0 1 18 6l2 1" /></svg>
    case 'import':
      return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
    case 'export':
      return <svg {...common}><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></svg>
    case 'checkins':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>
    case 'contests':
      return <svg {...common}><path d="M5 21V4M5 5h12l-2 4 2 4H5" /></svg>
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
    case 'trophy':
      return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0zM10 15h4M12 12v3M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M8 20h8M9 20v-2h6v2" /></svg>
  }
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
