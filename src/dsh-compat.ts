/**
 * DSH 兼容层：在不安装 @deepseek-ai/cordis / @deepseek-ai/dsh-tools 的环境下
 * 提供结构兼容的类型与辅助函数，使插件可独立开发和类型检查。
 *
 * 在真实 dsh 运行时中，Cordis Context 被注入 apply(ctx, config)，
 * ctx.tools.register() 接受结构兼容的工具定义。
 */

// ---------- 工具参数 schema ----------

export interface ParameterSpec {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required?: boolean
  description?: string
  enum?: string[]
  items?: Record<string, unknown>
  properties?: Record<string, ParameterSpec>
  default?: unknown
}

// ---------- 工具执行上下文 ----------

export interface ToolExec {
  signal: AbortSignal
  agent: {
    session: {
      append: (type: string, data: unknown) => void
    }
  }
}

// ---------- 工具定义 ----------

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, ParameterSpec>
  output: {
    schema: unknown
    render: (args: Record<string, unknown>, value: unknown) => Array<{ type: 'text'; text: string }>
  }
  execute: (args: Record<string, unknown>, exec: ToolExec) => Promise<unknown>
  presentCall?: (args: Record<string, unknown>) => {
    card: string
    title: string
    detail?: Record<string, unknown>
  }
  presentResult?: (args: Record<string, unknown>, value: unknown) => {
    card: string
    title: string
    detail?: Record<string, unknown>
  }
}

export function defineTool(def: ToolDefinition): ToolDefinition {
  if (!def.name || !def.description || !def.execute) {
    throw new Error('Invalid tool definition: missing required field')
  }
  return def
}

// ---------- Cordis Context 兼容类型 ----------

export interface FsService {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  mkdir(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  readdir(path: string): Promise<string[]>
}

export interface ToolsService {
  register(tool: ToolDefinition): () => void
}

/** RPC bridge：host.call / handle，供 client 半边拉数据 */
export interface RpcService {
  handle(method: string, handler: (params: unknown) => Promise<unknown>): () => void
  call: (method: string, params?: unknown) => Promise<unknown>
}

export interface AgentLike {
  id: string
  ctx: Context
}

export interface AgentsService {
  get(id: string): AgentLike | undefined
}

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => void | Promise<void>
}

export interface WebServerService {
  register(route: WebRoute): () => void
}

export interface Context {
  tools: ToolsService
  agents?: AgentsService
  webServer?: WebServerService
  fs?: FsService
  rpc?: RpcService
  effect: (fn: () => void | (() => void)) => void
  on: (event: string, handler: (...args: unknown[]) => unknown) => () => void
  emit: (event: string, ...args: unknown[]) => void
}

// ---------- 插件配置 ----------

export interface PluginConfig {
  /** 数据目录路径（存 JSON 状态文件）；留空则用 workspace 下 .icpc-data/ */
  dataDir: string
  /** AI 配置（生成训练计划用） */
  ai: {
    enabled: boolean
    baseURL: string
    apiKey: string
    model: string
  }
}

/**
 * Standard Schema compatible config contract.
 * Cordis reads only `Config['~standard'].validate()`; keeping the local
 * implementation avoids a runtime dependency on schemastery in file plugins.
 */
export const Config = {
  '~standard': {
    version: 1 as const,
    vendor: 'schemastery',
    validate(raw: unknown) {
      const input = raw && typeof raw === 'object' ? raw as Partial<PluginConfig> : {}
      return { value: resolveConfig(input) }
    },
  },
}

export function resolveConfig(raw: Partial<PluginConfig> = {}): PluginConfig {
  return {
    dataDir: raw.dataDir ?? '',
    ai: {
      enabled: raw.ai?.enabled ?? false,
      baseURL: raw.ai?.baseURL ?? 'https://api.deepseek.com/v1',
      apiKey: raw.ai?.apiKey ?? '',
      model: raw.ai?.model ?? 'deepseek-chat',
    },
  }
}
