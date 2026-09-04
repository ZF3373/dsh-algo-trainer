# dsh-icpc-workbench

ICPC 竞赛编程训练台 — DeepSeek Harness 插件。

将 [icpc-workbench](https://github.com/ZF3373/icpc-workbench) 的核心训练能力（刷题同步、弱项分析、今日推荐、训练计划、间隔复习、模板库、赛事中心、打卡）封装为 dsh agent 工具，让 AI agent 能直接帮选手完成训练全流程。

## 设计方案

**不搬 Express/SQLite**——用 dsh 原生服务重建数据层与适配层：

| 层 | 原项目 | 本插件 |
|---|---|---|
| 数据持久化 | SQLite (node:sqlite) | JSON 文件（通过 dsh `fs` 服务落盘到 workspace 目录） |
| 网络请求 | Node `fetch` | dsh `web.fetch` / 全局 `fetch` |
| 适配范围 | CF + AtCoder + 洛谷 + 牛客 | **CF + AtCoder**（洛谷/牛客需 Cookie/反爬，首版不支持） |
| Agent 接口 | Express REST 路由 | dsh `ctx.tools.register()`（10 个 `icpc_` 前缀工具） |
| 前端 | React SPA | dsh Slot UI 面板（紧凑仪表盘） |
| 分析引擎 | 依赖 DB 的函数 | **纯函数**（输入 `SubmissionRow[]`，无 IO 依赖） |

## 目录结构

```
dsh-icpc-workbench/
├── package.json              # dsh 插件包定义（dsh.client 指向 client/）
├── tsconfig.json             # host 侧 tsconfig
├── tsconfig.client.json      # client 侧 tsconfig
├── cordis.patch.yml          # dsh 配置补丁行
├── README.md
├── src/                      # Host 半边
│   ├── index.ts              # 插件入口：apply(ctx, config) — store 初始化 + 工具/RPC 注册
│   ├── dsh-compat.ts         # dsh 类型兼容层（Context / ToolDefinition / FsService / RpcService / Config）
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
│   ├── tools/                # 10 个 agent 工具
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
│   │   └── import.ts         # icpc_import — 手动导入
│   └── rpc/
│       └── index.ts          # Host RPC bridge（icpc.dashboard / icpc.trend / icpc.contests）
├── client/
│   └── index.ts              # Client 半边：紧凑仪表盘面板（Slot UI + 文本渲染降级）
└── tests/
    └── analysis.test.ts      # 24 个纯函数测试
```

## 安装

```bash
# 在 dsh profile 中添加
dsh plugin --profile web add dsh-icpc-workbench

# 或从源码
cd dsh-icpc-workbench
npm install
```

## 配置

```yaml
# cordis.patch.yml
- insert:
    - id: icpc-workbench
      name: 'dsh-icpc-workbench'
      config:
        dataDir: ''           # 数据目录，留空则用 workspace/.icpc-data/
        ai:
          enabled: false
          baseURL: 'https://api.deepseek.com/v1'
          apiKey: ''
          model: 'deepseek-chat'
```

AI 配置也可运行时通过 `icpc_settings` 工具修改（持久化到 JSON）。

## Agent 工具

| 工具 | 功能 |
|------|------|
| `icpc_sync` | 同步 CF/AtCoder 提交记录（增量，支持 all 批量） |
| `icpc_stats` | 统计分析：overall / weakness / trend |
| `icpc_today` | 今日三档训练推荐（巩固/同段/挑战，弱项优先） |
| `icpc_generate_plan` | AI 生成训练计划（无 key 降级模板） |
| `icpc_manage_plan` | 计划管理：list/detail/checkin/uncheck/delete/import |
| `icpc_review` | 间隔复习库：list/add/feedback/remove |
| `icpc_templates` | 114 课模板库：browse/next/set_status |
| `icpc_contests` | 多平台赛事（CF+AtCoder 聚合） |
| `icpc_checkin` | 日历打卡：streak/month/date/checkin/uncheck |
| `icpc_settings` | 设置：get/set_account/set_ai |
| `icpc_import` | 手动导入刷题记录（JSON） |

## Client 面板

紧凑仪表盘面板通过 `rpc.call('icpc.dashboard')` 拉取一次聚合数据，展示：
- 总体统计（提交/AC/AC率/解题数）
- 能力值 + 连续打卡 + 到期复习
- 今日三档训练推荐题单
- 弱项 Top5
- 今日任务清单与打卡状态

## 测试

```bash
npx tsx --test tests/**/*.test.ts
```

24 个测试覆盖全部纯函数：难度分桶、AC 率计算、总体统计、弱项画像、趋势周键、标签净化、能力值估算、三档选题、间隔复习调度、计划 JSON 解析容错。

## dsh 插件契约

- **`name`**: `'dsh-icpc-workbench'`
- **`inject`**: `['tools', 'fs', 'rpc']` — 等待三个 dsh 服务就绪后挂载
- **`apply(ctx, config)`**: 加载 JSON 存储 → 初始化 CF/AtCoder 适配器 → 注册 10 个工具 + 3 个 RPC 方法 → `ctx.effect()` 注册 dispose 落盘
- **`Config`**: Schemastery 兼容 schema（dataDir / ai）
