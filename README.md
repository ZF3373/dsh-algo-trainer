# dsh-algo-trainer

算法学习训练台 — DeepSeek Harness 插件。

将 [icpc-workbench](https://github.com/ZF3373/icpc-workbench) 的核心训练能力（刷题同步、弱项分析、今日推荐、训练计划、间隔复习、模板库、赛事中心、打卡）封装为 dsh agent 工具，让 AI agent 能直接帮选手完成训练全流程。

## 设计方案

**不搬 Express/SQLite**——用 dsh 原生服务重建数据层与适配层：

| 层 | 原项目 | 本插件 |
|---|---|---|
| 数据持久化 | SQLite (node:sqlite) | JSON 文件（node:fs 落盘到 DSH_HOME/.icpc-data/） |
| 网络请求 | Node `fetch` | 全局 `fetch`（Host 进程内可用） |
| 适配范围 | CF + AtCoder + 洛谷 + 牛客 | **CF + AtCoder**（洛谷/牛客需 Cookie/反爬，首版不支持） |
| Agent 接口 | Express REST 路由 | dsh `ctx.tools.register()`（13 个 `icpc_` 前缀工具） |
| 前端 | React SPA | dsh Slot UI 面板（设置页引导面板） |
| 分析引擎 | 依赖 DB 的函数 | **纯函数**（输入 `SubmissionRow[]`，无 IO 依赖） |

> 说明：`ctx.fs`（dsh fs 服务）的接口是 `resolve/readText/writeText/stat` 风格，
> 与本插件假设的 `readFile/writeFile/mkdir` 不兼容，且 host 侧不存在 `rpc` 服务。
> 因此数据层统一使用 node:fs（文件插件运行在 Host Node 进程中，可靠且已验证），
> client 半边为静态引导面板，不做 client→host RPC。

## 目录结构

```
dsh-algo-trainer/
├── package.json              # dsh 插件包定义（dsh.bundle + dsh.client）
├── tsconfig.json             # host 侧 tsconfig
├── tsconfig.client.json      # client 侧 tsconfig
├── cordis.patch.yml          # dsh 配置补丁行
├── scripts/
│   └── wrap-client.mjs       # 将 ESM client bundle 包装为 __ModuleLoader__ 格式
├── README.md
├── src/                      # Host 半边
│   ├── index.ts              # 插件入口：apply(ctx, config) — store 初始化 + 13 工具注册
│   ├── dsh-compat.ts         # dsh 类型兼容层（Context / ToolDefinition / FsService / Config）
│   ├── types.ts              # 跨模块共享类型（PlatformId / Verdict / WeaknessProfile / TodayPlan / ...）
│   ├── store/
│   │   ├── schema.ts         # JSON 数据模型（ProblemRecord / SubmissionRecord / PlanRecord / ...）
│   │   └── index.ts          # IcpcStore 类：内存索引 + 防抖落盘（替代 SQLite）
│   ├── adapters/
│   │   ├── types.ts          # PlatformAdapter / ContestAdapter 接口
│   │   ├── codeforces.ts     # CF 适配器（user.status + contest.list，knownExternalIds 增量终止）
│   │   └── atcoder.ts        # AtCoder 适配器（kenkoooo API，from_second 增量，内存缓存题目资源）
│   ├── analysis/             # 纯函数分析引擎（无 DB 依赖）
│   │   ├── stats.ts          # 总体统计（attempts/AC/AC率/各平台/各难度/各标签）
│   │   ├── weakness.ts       # 弱项画像（标签/难度 gap 打分）
│   │   ├── trend.ts          # 12 周趋势（ISO 周键，空周补 0）
│   │   ├── tags.ts           # 标签净化（过滤赛事/年份/地区等噪声标签）
│   │   └── today.ts          # 今日三档选题（能力值估算 + 弱项优先 + rotate 换一批）
│   ├── reviews/
│   │   └── schedule.ts       # 间隔复习调度（1/3/7/14/30/60 天阶梯，hard/ok/easy 调档）
│   ├── plans/
│   │   └── planService.ts    # 训练计划服务（AI 生成 + 模板降级 + JSON 解析容错）
│   ├── templates/
│   │   ├── curriculum.ts     # 114 课算法模板大纲（数据文件）
│   │   └── progress.ts       # 学习进度管理（todo/learning/mastered + 下一课推荐）
│   ├── tools/                # 13 个 agent 工具
│   │   ├── helpers.ts        # textOutput / num / str 辅助
│   │   ├── sync.ts           # icpc_sync — 同步刷题记录
│   │   ├── stats.ts          # icpc_stats — 统计分析
│   │   ├── today.ts          # icpc_today — 今日三档训练
│   │   ├── plans.ts          # icpc_generate_plan + icpc_manage_plan
│   │   ├── reviews.ts        # icpc_review — 间隔复习库
│   │   ├── templates.ts      # icpc_templates — 模板库
│   │   ├── contests.ts       # icpc_contests — 赛事中心
│   │   ├── checkins.ts       # icpc_checkin — 日历打卡
│   │   ├── settings.ts       # icpc_settings — 设置
│   │   ├── import.ts         # icpc_import — 手动导入
│   │   ├── problems.ts       # icpc_problems — 题目浏览
│   │   └── export.ts         # icpc_export — 训练计划数据包导出
├── client/
│   └── index.ts              # Client 半边：设置页引导面板（Slot UI）
└── tests/
    └── analysis.test.ts      # 24 个纯函数测试
```

## 安装

```bash
# 在 dsh profile 中添加
dsh plugin --profile web add dsh-algo-trainer

# 或从源码
cd dsh-algo-trainer
npm install        # prepare 钩子会自动构建 lib/
```

## 配置

```yaml
# cordis.patch.yml
- insert:
    - id: algo-trainer
      name: 'dsh-algo-trainer'
      config:
        dataDir: ''           # 数据目录，留空则用 $DSH_HOME/.icpc-data/
        ai:
          enabled: false
          baseURL: 'https://api.deepseek.com/v1'
          apiKey: ''
          model: 'deepseek-chat'
```

AI 配置也可运行时通过 `icpc_settings` 工具修改（持久化到 JSON）。
注意：`icpc_settings get` 返回的 apiKey / cookie 会脱敏显示。

## Agent 工具（13 个）

| 工具 | 功能 |
|------|------|
| `icpc_sync` | 同步 CF/AtCoder 提交记录（增量，支持 all 批量） |
| `icpc_stats` | 统计分析：overall / weakness / trend |
| `icpc_today` | 今日三档训练推荐（巩固/同段/挑战，弱项优先） |
| `icpc_generate_plan` | AI 生成训练计划（无 key 降级模板） |
| `icpc_manage_plan` | 计划管理：list/detail/checkin/uncheck/delete/import/update_task/delete_task |
| `icpc_review` | 间隔复习库：list/add/feedback/remove |
| `icpc_templates` | 114 课模板库：browse/next/set_status/set_content/自建/例题 |
| `icpc_contests` | 多平台赛事（CF+AtCoder 聚合） |
| `icpc_checkin` | 日历打卡：streak/month/date/checkin/uncheck |
| `icpc_settings` | 设置：get/set_account/set_ai/set_adapter/set_cookies/set_reminder |
| `icpc_import` | 手动导入刷题记录（JSON/CSV） |
| `icpc_problems` | 浏览/搜索题目库（platform/difficulty/tag/q/bank） |
| `icpc_export` | 导出 AI 训练计划数据包（plan_package/plan_prompt） |

## Client 面板

设置页中注册「算法训练台」引导面板（`settings.section`），列出全部工具与使用方式。
由于文件插件没有 client→host RPC 通道（host 侧无 `rpc` 服务），面板为静态内容，
数据读写一律通过 `icpc_*` 工具在对话中完成。

## 测试

```bash
npx tsx --test tests/**/*.test.ts
```

24 个测试覆盖全部纯函数：难度分桶、AC 率计算、总体统计、弱项画像、趋势周键、标签净化、能力值估算、三档选题、间隔复习调度、计划 JSON 解析容错。

## dsh 插件契约

- **`name`**: `'dsh-algo-trainer'`
- **`inject`**: `['tools']` — 只依赖 dsh tools 服务；fs 接口不兼容、rpc 服务不存在，故均不注入
- **`apply(ctx, config)`**: 加载 JSON 存储（load 完成后工具才可安全读写）→ 初始化 CF/AtCoder 适配器 → 注册 13 个工具 → `ctx.effect()` 注册 dispose 落盘
- **`Config`**: 结构兼容的配置 schema（dataDir / ai）
- **`dsh.client`**: `{ platform: 'web' }` — client 半边由构建后的 `lib/client.mjs`（`__ModuleLoader__` 包装）提供
