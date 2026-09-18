/**
 * scripts/wrap-client.mjs
 *
 * 将 tsdown 输出的 ESM client bundle（lib/client.mjs）转换为 dsh client-modules
 * 要求的浏览器注册格式：`window.__ModuleLoader__.load({ id, factory })`。
 *
 * 官方 client 插件（dshmarket / dsh-client-ui-*）的 lib/client.js 都是这种包装；
 * 不做这一步，即使 dsh.client 声明正确，浏览器端也不会注册该 client 插件。
 *
 * 输入：lib/client.mjs（tsdown 的 ESM 输出）
 * 输出：覆盖 lib/client.mjs（CJS factory 包装，导出同名 exports 字段）
 *
 * 处理两种 export 形态（rolldown/tsdown 通常输出尾部集中 export 语句）：
 *   - 尾部 `export { a, b, c };` → 捕获名字并移除
 *   - 内联 `export const x` / `export function x` → 剥掉 export 关键字并捕获名字
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CLIENT_BUNDLE = join(ROOT, 'lib', 'client.mjs')
const PLUGIN_ID = 'dsh-algo-trainer'

const src = await readFile(CLIENT_BUNDLE, 'utf8')
const exported = []

// 1) 尾部集中导出：export { a, b, c };
let body = src
  .replace(/\n?\/\/# sourceMappingURL=.*$/m, '')
  .replace(/export\s*\{([^}]*)\}\s*;?/, (_, list) => {
    for (const n of list.split(',')) {
      const t = n.trim()
      if (t) exported.push(t)
    }
    return ''
  })

// 2) 内联导出：export const x / export function x / export async function x
body = body
  .replace(/export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/g, (_m, isAsync, fnName) => {
    exported.push(fnName)
    return `${isAsync ?? ''}function ${fnName}`
  })
  .replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_m, kw, vName) => {
    exported.push(vName)
    return `${kw} ${vName}`
  })
  .replace(/export\s+default\s+/g, '')

// 3) 只保留顶层确实存在的名字（行首缩进为 0 的声明），防止把局部变量误导出
const finalNames = [...new Set(exported)].filter((n) =>
  new RegExp(`(^|\\n)(?:async\\s+)?function\\s+${n}\\s*\\(|(^|\\n)(?:const|let|var)\\s+${n}\\s*=`).test(body),
)
if (finalNames.length === 0) throw new Error('wrap-client: 未找到任何可导出的顶层声明')

const assigns = finalNames.map((n) => `exports.${n} = ${n};`).join('\n')

const wrapped = `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body.trimEnd()}
${assigns}
return module.exports;
} });
`

await writeFile(CLIENT_BUNDLE, wrapped, 'utf8')
console.log(`wrap-client: ${CLIENT_BUNDLE} wrapped (exports: ${finalNames.join(', ')})`)
