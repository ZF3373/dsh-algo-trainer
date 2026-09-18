import type { Context } from './dsh-compat.ts'
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
