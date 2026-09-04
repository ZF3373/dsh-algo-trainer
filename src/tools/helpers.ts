/** 工具层共享辅助 */

export function textOutput(value: unknown): Array<{ type: 'text'; text: string }> {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return [{ type: 'text', text }]
}

export const ANY_OUTPUT = { type: 'object' }

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}
