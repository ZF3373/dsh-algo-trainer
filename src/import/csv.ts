/** 极简 RFC4180 风格 CSV 解析（移植自原 icpc-workbench） */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = (): void => { row.push(field); field = '' }
  const pushRow = (): void => {
    pushField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i += 1; continue
      }
      field += c; i += 1; continue
    }
    if (c === '"') { inQuotes = true; i += 1 }
    else if (c === ',') { pushField(); i += 1 }
    else if (c === '\n') { pushRow(); i += 1 }
    else if (c === '\r') { if (text[i + 1] === '\n') i += 1; pushRow(); i += 1 }
    else { field += c; i += 1 }
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

export const MANUAL_CSV_HEADER = [
  'problemKey', 'title', 'verdict', 'difficulty', 'tags', 'url', 'submittedAt', 'language', 'externalId',
] as const

export function parseCsvRows(
  platform: string,
  csv: string,
): Array<{
  platform: string
  problemKey: string
  title: string
  verdict: string
  difficulty: number | null
  tags: string[]
  url: string | null
  submittedAt: string
  language?: string
  externalId: string
}> {
  const rows = parseCsv(csv)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  for (const col of MANUAL_CSV_HEADER) {
    if (!header.includes(col)) {
      throw new Error(`CSV 缺少列: ${col}（表头: ${MANUAL_CSV_HEADER.join(',')}）`)
    }
  }
  return rows.slice(1).map((r, i) => {
    const obj: Record<string, string | number> = {}
    for (let c = 0; c < header.length; c += 1) {
      const val = (r[c] ?? '').trim()
      if (val === '') continue
      obj[header[c]] = header[c] === 'difficulty' ? Number(val) : val
    }
    const problemKey = String(obj.problemKey ?? '').trim()
    if (!problemKey) throw new Error(`第 ${i + 1} 行缺少 problemKey`)
    const verdictRaw = String(obj.verdict ?? 'SKIPPED').trim().toUpperCase()
    const tags = String(obj.tags ?? '').split('|').map((t) => t.trim()).filter(Boolean)
    const difficulty = obj.difficulty !== undefined ? Number(obj.difficulty) : NaN
    const externalId = String(obj.externalId ?? `manual:${platform}:${problemKey}:${verdictRaw}`)
    return {
      platform,
      problemKey,
      title: String(obj.title ?? problemKey).trim() || problemKey,
      verdict: verdictRaw,
      difficulty: Number.isFinite(difficulty) ? difficulty : null,
      tags,
      url: typeof obj.url === 'string' ? obj.url.trim() || null : null,
      submittedAt: obj.submittedAt ? new Date(String(obj.submittedAt)).toISOString() : new Date().toISOString(),
      language: typeof obj.language === 'string' ? obj.language.trim() || undefined : undefined,
      externalId,
    }
  })
}
