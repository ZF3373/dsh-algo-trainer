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
