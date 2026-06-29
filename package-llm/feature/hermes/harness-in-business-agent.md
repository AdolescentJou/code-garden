# 我是如何在业务 Agent 项目中应用 Harness 的

> **背景**：本文基于一个真实的企业级 AI Agent 平台的工程实践。这类 AI Agent 可以理解用户自然语言指令，自主规划并调用各种后端工具完成复杂的多步骤业务操作——提单、批量变更、查询报表、提交审批，Agent 会自己拆解任务、依次调用工具、自动决策。功能做起来很爽，但当 Agent 具备"真正执行"的能力后，怎么给它套上缰绳，就成了最重要的工程问题。本文记录了我们从零设计并实现 Harness 安全防护框架的完整思考过程。

---

## 目录

- [我是如何在业务 Agent 项目中应用 Harness 的](#我是如何在业务-agent-项目中应用-harness-的)
  - [目录](#目录)
  - [1. 为什么要做 Harness，难在哪里](#1-为什么要做-harness难在哪里)
    - [业务场景](#业务场景)
    - [核心挑战：AI Agent 的"边界"问题不同于传统权限系统](#核心挑战ai-agent-的边界问题不同于传统权限系统)
  - [2. 整体架构](#2-整体架构)
    - [模块职责一览](#模块职责一览)
  - [3. 核心模块详解](#3-核心模块详解)
    - [3.1 HarnessOrchestrator — 编排器](#31-harnessorchestrator--编排器)
    - [3.2 L1 IntentGuard — 意图安全防护](#32-l1-intentguard--意图安全防护)
    - [3.3 L2 SkillGuard — 技能包安全扫描](#33-l2-skillguard--技能包安全扫描)
    - [3.4 L3 OperationGuard — 操作风险控制](#34-l3-operationguard--操作风险控制)
    - [3.5 L4 ResourceGuard — 资源保护层](#35-l4-resourceguard--资源保护层)
      - [检查1：月度 Token 配额](#检查1月度-token-配额)
      - [检查2：熔断器](#检查2熔断器)
      - [检查3：上下文窗口保护](#检查3上下文窗口保护)
      - [检查4：沙箱租户配额](#检查4沙箱租户配额)
  - [4. 横切关注点](#4-横切关注点)
    - [4.1 HITL — 人工介入机制](#41-hitl--人工介入机制)
    - [4.2 HarnessRuleEngine — 安全规则引擎](#42-harnessruleengine--安全规则引擎)
    - [4.3 HookRunner — 生命周期钩子](#43-hookrunner--生命周期钩子)
    - [4.4 AuditLogger — 审计日志](#44-auditlogger--审计日志)
    - [4.5 GuardStateManager — 热开关](#45-guardstatemanager--热开关)
  - [5. 两个关键设计点](#5-两个关键设计点)
    - [5.1 fail-open vs fail-closed：不同层要有不同的哲学](#51-fail-open-vs-fail-closed不同层要有不同的哲学)
    - [5.2 HITL 双模式：自确认 vs 审批流](#52-hitl-双模式自确认-vs-审批流)
  - [6. 关键设计决策与 Trade-off](#6-关键设计决策与-trade-off)
    - [6.1 为什么四层而不是一层](#61-为什么四层而不是一层)
    - [6.2 规则为什么要放数据库而不是全部写死在代码里](#62-规则为什么要放数据库而不是全部写死在代码里)
    - [6.3 为什么审计日志要做双队列而不是直接写 DB](#63-为什么审计日志要做双队列而不是直接写-db)
    - [6.4 热开关为什么不支持 API 运行时切换](#64-热开关为什么不支持-api-运行时切换)
    - [6.5 语义检测为什么是"可选兜底"而不是"主力"](#65-语义检测为什么是可选兜底而不是主力)
  - [7. 端到端流程全览](#7-端到端流程全览)
  - [后记](#后记)

---

## 1. 为什么要做 Harness，难在哪里

### 业务场景

想象一个"智能业务助手"：用户一句话"帮我把上周超时未处理的工单批量关闭，并通知对应的负责人"，Agent 会自动拆解成：查询工单、筛选条件、批量更新状态、获取负责人列表、逐一发送通知。整个过程不需要用户逐步指引。

这类自主执行能力带来效率提升的同时，也带来了一系列安全问题：

| 问题 | 没有 Harness 时 | 有 Harness 后 |
|------|----------------|--------------|
| 用户说了一句模糊的话，Agent 会不会做错事 | 不知道 | L1 意图检测拦截越权请求 |
| 第三方 Skill 包里有漏洞怎么办 | 不知道 | L2 静态扫描 + CVE 检测 |
| 高危工具调用（批量删除等）如何防止误操作 | 没有防线 | L3 风险评分 + HITL 人工确认 |
| 下游服务挂了，Agent 无限重试怎么处理 | 超时等死 | L4 熔断器快速失败 |
| Token 月度配额用完了还继续跑 | 账单炸了 | L4 预算拦截 |
| 上线初期规则不准，误拦截率高怎么办 | 只能发版回滚 | 热开关三态（enabled/observe/disabled） |

### 核心挑战：AI Agent 的"边界"问题不同于传统权限系统

传统权限系统是**静态的**：A 角色能调用 B 接口，在数据库里配一条记录就行了。

AI Agent 的边界问题是**动态的**：
- 同一个工具，在不同上下文下风险等级完全不同（查询 vs 批量删除）
- 用户输入是自然语言，存在被注入恶意指令的可能
- Agent 的"意图"需要语义理解才能判断是否合法
- 执行链路是多步骤的，单点权限控制不够，需要在不同阶段设置多道关卡

这些特点决定了 Harness 不能是一个简单的权限表，而必须是一个**多层次、动态感知的安全防护框架**。

---

## 2. 整体架构

```
用户输入
   │
   ▼
HarnessOrchestrator（编排器）
   │
   ├── [L1 + L2 并行] IntentGuard + SkillGuard
   │         │
   │         └── BLOCK/HITL_WAIT → 短路，跳过后续层
   │
   ├── [L3 串行] OperationGuard
   │     ├── PermissionChecker（六级硬保护）
   │     ├── RuleEngine（动态安全规则）
   │     ├── RiskScorer（四维度加权评分）
   │     └── HITLInterceptor（人工确认）
   │
   └── [L4 串行] ResourceGuard
         ├── BudgetInterceptor（月度 Token 配额）
         ├── CircuitBreakerRegistry（熔断器）
         ├── ContextEfficiencyOptimizer（上下文窗口保护）
         └── SandboxQuotaCheck（租户沙箱配额）
   │
   ▼
工具执行
   │
   ▼
AuditLogger（异步写审计日志）
```

### 模块职责一览

| 模块 | 职责 |
|------|------|
| `HarnessOrchestrator` | 四层 Guard 统一编排调度，短路求值，超时控制，failOpen 降级 |
| `IntentGuard` | 入口层意图检测，四环流水线，拦截提示词注入和越权请求 |
| `SkillGuard` | 第三方 Skill 包四级安全扫描，静态分析 + CVE 检测 + 权限交叉比对 |
| `OperationGuard` | 工具调用前六级权限校验 + 动态规则 + 风险评分 + HITL 触发 |
| `ResourceGuard` | 资源维度保护，月度配额 + 熔断器 + 上下文窗口 + 沙箱配额 |
| `HITLInterceptor` | 人工确认机制，一次性 Token 生成 + 通知推送 + 超时管理 |
| `HarnessRuleEngine` | 双源规则引擎（内置规则 + DB 动态规则），TTL 缓存，热更新 |
| `HookRunner` | 生命周期钩子调度器，支持函数/命令/HTTP 三种 Hook 类型 |
| `AuditLogger` | 双队列异步审计日志，合规优先 flush，背压保护 |
| `GuardStateManager` | 热开关，三态（enabled/observe/disabled），Lion 配置中心驱动 |

---

## 3. 核心模块详解

### 3.1 HarnessOrchestrator — 编排器

编排器是 Harness 框架的调度核心，所有 Guard 层通过它统一调度。

**核心设计**：

```typescript
// 所有 Guard 层实现同一个接口
interface IGuardLayer {
  readonly layer: GuardLayer;  // INTENT / SKILL / OPERATION / RESOURCE
  readonly name: string;
  check(context: HarnessContext): Promise<HarnessDecision>;
}

// 决策只有三种
type Decision = 'ALLOW' | 'BLOCK' | 'HITL_WAIT';
```

**执行流程**：

```
check(context)
  ↓
① enrichContext：从 toolInput 展开顶层字段到 metadata（供规则引擎使用）
② 过滤出已注册的活跃 Guard 层
③ L1+L2 并行执行（Promise.all）
   └── 任意一层 BLOCK/HITL → 短路，跳过后续层
④ L3+L4 串行执行
   └── 每层独立超时（Promise.race），超时按 failOpen 策略处理
⑤ 汇总 HarnessResult（各层摘要 + 最终决策 + checkId）
⑥ Prometheus 埋点（仅 BLOCK/HITL 计数，ALLOW 降为日志）
⑦ HookRunner.fire（BLOCK/HITL 时触发通知事件）
⑧ AuditLogger.push（异步写审计日志）
```

**为什么 L1/L2 并行而 L3/L4 串行？**

L1（意图检测）和 L2（Skill 扫描）互相独立，并行执行节省时间。L3 需要先出风险评分决策，L4 才检查资源是否允许，有先后依赖，必须串行。

---

### 3.2 L1 IntentGuard — 意图安全防护

**时机**：用户消息到达后，LLM 推理资源消耗前。

**核心价值**：在入口处拦截可疑请求，避免 Token 浪费和上下文污染。被注入攻击的 Prompt 一旦进入 LLM 上下文，后续几乎无法清除，所以这道关卡的投资回报率最高。

**四环检测流水线**：

```
输入文本
  ↓
[环1] NormalizationDetector（归一化）
      └── Base64 解码、Unicode 归一化、零宽字符剥离
          对抗"把攻击指令用 Base64 藏起来"这类混淆手法
  ↓
[环2] PatternMatchingDetector（模式匹配）
      └── 正则规则集匹配已知攻击模式（提示词注入、越权指令等）
          同时检测原文和归一化后的文本
  ↓
[环3] ContextAnalysisDetector（上下文分析）
      └── 基于 Session 历史计算累积风险分
          防止"分散投毒"：每条消息单独看没问题，组合起来才是攻击
  ↓
[环4] SemanticClassifier（语义分类，可选兜底）
      └── 调 LLM 做语义级判断
          ⚠️ 仅当前三环未命中 HIGH/CRITICAL 时触发
             → 已确定是攻击时，没必要再花 Token 确认
  ↓
四环取最大威胁等级 → ALLOW / HITL / BLOCK
```

**威胁等级到决策的映射**：

| 威胁等级 | 决策 | 含义 |
|---------|------|------|
| NONE / LOW | ALLOW | 正常放行 |
| MEDIUM | HITL_WAIT | 有风险但不确定，让用户再确认一次 |
| HIGH | BLOCK | 高置信度攻击，直接拦截 |
| CRITICAL | BLOCK | 严重威胁，拦截 + 告警 |

**整体 fail-open**：IntentGuard 出现异常或超时，默认**放行**。原因：L3 OperationGuard 会在工具执行前再做一次更精准的检查，两道防线之间有冗余容错。

**观察模式**：上线初期通过热开关设置为 `observe` 模式——检测但不拦截，只记日志，收集误报数据后再调阈值，再开启真实拦截。

---

### 3.3 L2 SkillGuard — 技能包安全扫描

**背景**：平台允许接入第三方 Skill 包，这带来了供应链安全风险——Skill 包里如果包含危险 API 调用或已知 CVE 漏洞，Agent 执行它等于帮攻击者做了事。

**四级扫描管道**：

```
Skill 包提交
  ↓
[L1] StructureCheck（包结构校验）
     └── manifest 完整性 / 目录规范 / package.json 合法性
         快速过滤明显不合规的包，同步执行
  ↓
[L2] StaticAnalyzer（静态代码扫描）
     └── 危险 API 调用（exec/eval/child_process 等）
         硬编码凭证（API Key 正则匹配）
         同步执行
  ↓
[L3] VulnerabilityScanner（漏洞扫描）
     └── 调 OSV API 查 CVE 漏洞数据库
         ⚡ 异步后台执行，不阻塞 Skill 注册主流程
  ↓
[L4] PermissionCrossCheck（权限交叉比对）
     └── Skill 声明的权限 vs 代码实际使用的权限
         发现"声明只读但代码调写 API"等权限欺诈
         同步执行
  ↓
生成 SkillPolicy（初步）→ L3 异步完成后更新审核状态
```

运行时通过 `isSkillAllowed()` 做内存级白名单查询，几乎没有额外性能开销。

---

### 3.4 L3 OperationGuard — 操作风险控制

**这是整个 Harness 框架里最核心的一层**。时机是工具调用真正执行的前一刻，是 Agent"想做"和"真正做"之间的最后审查点。

**执行链（三关 + 可选规则引擎）**：

```
工具调用请求（toolName + toolInput）
  ↓
[关卡1] PermissionChecker（六级硬保护）
  优先级1（最高）：敏感路径硬编码检查 → 直接拒绝，不可绕过
  优先级2：工具黑名单检查
  优先级3：工具白名单检查 → 在白名单内直接放行
  优先级4：路径规则检查（自定义 deny 路径）
  优先级5：命令 deny 模式（正则匹配）
  优先级6：权限模式（default/plan/full_auto）
  ↓（通过）
[关卡1.5] HarnessRuleEngine（可选注入）
  └── 内置规则 + DB 动态规则 → PASS / WARN / BLOCK / HITL
      PASS/WARN → 继续向下
      BLOCK/HITL → 短路返回（跳过 RiskScorer）
  ↓（PASS）
[关卡2] RiskScorer（四维度加权评分，0-100）
  0~39   → ALLOW（直接放行）
  40~59  → HITL（标准确认）
  60~79  → HITL_HIGH_PRIORITY（高优先级确认）
  80~100 → BLOCK（直接拒绝）
  ↓（HITL 场景）
[关卡3] HITLInterceptor
  └── 生成一次性确认 Token → 写 DB + 内存注册 → 推即时消息通知 → 设定超时
```

**PermissionChecker 的 default 权限模式**：

为了不过度打断用户体验，default 模式按工具名前缀自动分类：

```
只读类关键词（get/list/query/search/find/fetch/read...）
  → 直接放行，无需确认

变更类关键词（create/update/delete/batch/execute/deploy/publish...）
  → 需要额外权限确认
```

大部分查询请求不会被打断，只有真正有副作用的操作才走确认流程。

**sensitive 快捷通道**：工具开发者可在工具定义里设置 `sensitive: true`，Agent 尝试调用时，无论 RiskScorer 打多少分，都直接触发 HITL，不经过评分环节。适合那些"永远需要人工确认"的高风险工具。

**fail-closed 策略**：OperationGuard 出现异常时，默认**拒绝**（而不是放行）。与 L1 的 fail-open 策略相反——这是最后一关，放行可能导致实际副作用（工单被提了、数据被删了），"多拒绝一次"的代价远小于"放错一次"。

---

### 3.5 L4 ResourceGuard — 资源保护层

L4 关注的不是"做什么"，而是"能不能做"——资源维度的边界。

**四项检查（短路顺序执行）**：

#### 检查1：月度 Token 配额

```
查询团队当月累计 Token 使用量（RDS + TTL 缓存）
  ↓
已用量 < 月度配额 → 放行
已用量 ≥ 月度配额 → BLOCK（"本月 Token 配额已用尽"）
```

RDS 聚合查询加了 TTL 缓存，避免每次工具调用都查库。

#### 检查2：熔断器

每个工具都有独立的熔断器实例（三态状态机）：

```
CLOSED（正常）: 允许请求，统计失败率
    ↓ 失败次数超阈值
OPEN（熔断）: 快速失败，不再发请求
    ↓ 等待恢复时间窗口
HALF_OPEN（半开探测）: 放行一个测试请求
    ↓ 成功 → 回 CLOSED
    ↓ 失败 → 回 OPEN（指数退避延长等待时间）
```

为什么不用全局熔断器？因为工具 A 挂了不应该影响工具 B。每个工具独立管理熔断状态。

#### 检查3：上下文窗口保护

Session 历史如果无限累积，最终会超出 LLM 的上下文窗口，导致截断或报错。ResourceGuard 估算当前 Session 的 Token 数（字符数/4 启发式），接近阈值时告警，超出硬限制时拦截。

> 注意：ResourceGuard **只负责边界检查**，决定"是否需要压缩"。具体的上下文截断、摘要、Checkpoint 压缩等策略由 AgentLoop 负责执行，不在安全框架职责范围内。

#### 检查4：沙箱租户配额

平台有代码执行沙箱，按**租户维度**（而不是全局）限制沙箱占用数。防止单个高频租户耗尽全局沙箱池，影响其他租户。

---

## 4. 横切关注点

### 4.1 HITL — 人工介入机制

HITL（Human-In-The-Loop）是 Harness 中用户感知最强的机制。当 Agent 要做一件有一定风险但不确定是否应该拦截的事时，HITL 把决策权交还给人。

**生命周期**：

```
OperationGuard 触发 HITL
  ↓
HITLInterceptor.createHITL()
  ├── 生成一次性 Token（cryptoRandomBytes，64位）
  ├── 写入 DB（token + userId + expiresAt + status=pending）
  ├── 注册到内存 ChannelRegistry（token → Promise resolver）
  └── 推送即时消息通知（含操作摘要 + 确认链接）
  ↓
Agent 暂停执行，等待确认
  ↓
用户点击确认（approved=true）或拒绝（approved=false）
  ↓
HITLInterceptor.confirm()
  ├── TOKEN_NOT_FOUND → 报错
  ├── CONFLICT（已消费）→ 报错（防重放）
  ├── FORBIDDEN（userId 不匹配）→ 报错（防越权）
  ├── TOKEN_EXPIRED → 报错
  └── 成功 → resolve/reject ChannelRegistry 中对应的 Promise
  ↓
Agent 恢复执行 / 操作被取消
```

**两种模式的选择**：

见 [5.2 HITL 双模式](#52-hitl-双模式自确认-vs-审批流)。

---

### 4.2 HarnessRuleEngine — 安全规则引擎

规则引擎解决了"规则全靠硬编码，每次调整都要发版"的问题。

**双源规则架构**：

```
L1 内置规则（代码硬编码）         L2 DB 动态规则（运营配置）
  ├── shell_inject_prevention      ├── 团队自定义规则
  ├── budget_guard                 ├── 业务特定拦截规则
  ├── rate_limit                   └── 实验性规则（可随时关闭）
  ├── content_keyword_filter
  ├── tool_restriction
  └── generic_condition            ← SPEC-035 新增：通用条件表达式
           ↓                                ↓
           └──────────── 去重合并 ──────────┘
                         （同 rule_id 时 DB 覆盖内置参数）
                                ↓
                    按 priority ASC 排序
                                ↓
                    逐条评估，首条非PASS即短路返回
```

**七种内置评估器**：

| 评估器 | 职责 |
|--------|------|
| `ShellInjectEvaluator` | 检测 Shell 注入模式（`;rm -rf`、`$(...)` 等） |
| `BudgetGuardEvaluator` | 预算额度检查（工具调用参数中的金额字段） |
| `RateLimitEvaluator` | 频率限制（按 teamId 滑动窗口计数） |
| `ContentKeywordEvaluator` | 内容关键词过滤（黑名单词语） |
| `CustomRegexEvaluator` | 自定义正则匹配 |
| `ToolRestrictionEvaluator` | 工具调用限制（某些工具只允许特定角色调用） |
| `GenericConditionEvaluator` | 通用条件表达式（字段比较、逻辑组合） |

`GenericConditionEvaluator` 是最后加的，也是最强大的——它让非研发人员也能写规则：

```json
// 运营配置一条规则，无需改代码，30s 内生效
{
  "ruleId": "high_budget_approval",
  "name": "大额预算需审批",
  "condition": { "field": "budget", "op": "gt", "value": 50000 },
  "action": {
    "type": "HITL",
    "approvalType": "standard",
    "approvers": ["mis_id_of_approver"],
    "userMessage": "申请金额超过 5 万元，需要负责人审批",
    "hitlTtlMs": 600000
  }
}
```

DB 规则缓存 TTL 为 30 秒，修改后最多 30 秒内所有实例生效，无需重启。

---

### 4.3 HookRunner — 生命周期钩子

HookRunner 提供了类似 Git Hooks 的机制——在 Agent 执行生命周期的特定节点挂载自定义逻辑。

**支持的 Hook 事件**（部分）：

```
SESSION_START      会话开始
USER_PROMPT_SUBMIT 用户消息提交（入口层预扫描）
PRE_TOOL_USE       工具调用前
POST_TOOL_USE      工具调用后
NOTIFICATION       通知推送（HITL/BLOCK 事件）
SESSION_END        会话结束
```

**三种 Hook 执行器**：

- `FunctionHook`：内联函数，最常用，直接注入业务逻辑
- `CommandHook`：执行系统命令（如调用外部安全扫描工具）
- `HttpHook`：向外部服务发 HTTP 回调（如通知 SIEM 系统）

**关键配置参数** `blockOnFailure`：

```
blockOnFailure=true  → 顺序执行，首个 Hook 失败即阻断后续流程
blockOnFailure=false → Promise.allSettled 并行执行，失败不影响主链路
```

入口层和 AgentCore 层各自持有**独立** HookRunner 实例，互不干扰。

---

### 4.4 AuditLogger — 审计日志

Harness 的每次决策都需要审计日志，但天真地"每层都写一条"会带来巨大噪声——一个平常的 ALLOW 请求经过四层 Guard，会产生四条"正常通过"日志，大部分场景没有人会看这些日志，而存储成本实实在在地存在。

**分层写入策略（降噪核心）**：

```
BLOCK 决策  → 只写触发拦截的那一层日志（精确定位原因，不写汇总避免重复）
ALLOW 决策  → 只写一条 orchestrator_summary 汇总日志（"所有层通过"，降噪）
HITL 事件   → 始终写完整 hitl_event 日志（合规要求，不可省略）
工具调用    → 始终写 tool_use 日志（操作留痕）
沙箱执行    → 写 sandbox_execution 日志（含命令哈希、退出码）
```

**双队列机制**：

```
complianceQueue（合规必留）: BLOCK/HITL 日志，最高优先级 flush
mainQueue（运营分析）: ALLOW 汇总等，批量 flush（每 100ms 或队列满 50 条）
```

极端情况下数据库写入连续失败 ≥3 次，激活背压保护：合规日志 fallback 写本地文件，非敏感日志直接丢弃。队列超过 5000 条时做溢出保护（splice 前 10% + 记录 overflow 日志）。

---

### 4.5 GuardStateManager — 热开关

每个 Guard 层支持三种运行状态，通过**配置中心**实时切换，无需重启服务：

| 状态 | 行为 | 典型使用场景 |
|------|------|------------|
| `enabled` | 正常检测 + 拦截 + 写审计日志 | 生产正常运行 |
| `observe` | 检测但**不拦截**，只记日志 | 新规则灰度期，收集误报率数据 |
| `disabled` | 完全跳过，不检测不记录 | 紧急回滚，规则有严重误报 |

状态变更路径：配置中心 → `getGuardRuntimeConfig()` → 各层 check() 头部 `GuardStateManager.checkState()` → 决定 shouldSkip / observeOnly。

还支持**团队灰度**：某条新规则先只对指定团队开启 observe，其他团队维持 enabled，做精细化灰度验证。

---

## 5. 两个关键设计点

### 5.1 fail-open vs fail-closed：不同层要有不同的哲学

Harness 各层在"自身出错时是否放行"这个问题上，答案不一样：

| Guard 层 | 异常策略 | 原因 |
|---------|---------|------|
| L1 IntentGuard | **fail-open（放行）** | L3 有兜底，误拦截代价更高（打断用户体验） |
| L2 SkillGuard | fail-open | Skill 已经注册，扫描失败不应影响正在进行的会话 |
| L3 OperationGuard | **fail-closed（拒绝）** | 最后一关，放行可能产生实际副作用（无法回滚） |
| L4 ResourceGuard | fail-closed | 资源状态不确定时放行可能触发雪崩 |

这个分层设计体现了一个原则：**离实际执行越近，越要保守**。L1 拦错了，最坏的结果是用户重新输入一遍；L3 放错了，最坏的结果是批量删除了几千条数据。

---

### 5.2 HITL 双模式：自确认 vs 审批流

HITL 并不是"弹个确认框"这么简单，不同场景对"谁来确认"有完全不同的要求：

**simple 模式**：适合"操作发起者自己确认"。

```
Agent 触发 HITL
  ↓ 生成确认 Token
  ↓ 通过 WebSocket 实时推送给前端
  ↓ 用户看到确认弹窗，点击"确认"/"取消"
  ↓ Token 消费，Agent 恢复执行
```

特点：实时性强，适合"用户自己发起、需要二次确认防误操作"的场景。

**standard 模式**：适合"需要特定审批人批准"。

```
Agent 触发 HITL
  ↓ 生成 StandardToken（格式 hitl_std_xxx）
  ↓ StandardApprovalHandler.submitApproval()
     ├── 注册到内存审批表
     ├── 向配置的审批人发即时消息（含操作摘要 + 审批链接）
     └── 启动超时定时器（TTL 可配置，默认 10 分钟）
  ↓ Agent 进入 WAITING_APPROVAL 状态，当前请求挂起
  ↓ 审批人点击批准 / 拒绝
  ↓ 回调 POST /api/hitl/callback
  ↓ Agent 恢复执行 / 操作被拒绝
  ↓ 超时未处理 → 自动拒绝
```

特点：异步审批，适合"发起操作的人没有权限，需要上级或专职审批人批准"的场景。两种模式通过规则配置中的 `approvalType` 字段切换，无需改代码。

---

## 6. 关键设计决策与 Trade-off

### 6.1 为什么四层而不是一层

早期版本只有一个统一的权限检查模块，后来发现问题：

- 意图检测（自然语言分析）和工具权限检查（结构化参数）是两种完全不同的逻辑，混在一起代码难以维护
- 不同阶段的检查有不同的性能要求（L1 要在 ms 级内完成，L3 可以有更长的超时）
- 不同层的 failOpen 策略不同，混在一起逻辑容易出错
- 分层后每层可以独立热开关，灰度上线更灵活

### 6.2 规则为什么要放数据库而不是全部写死在代码里

一开始所有规则都是硬编码的。调整一个关键词黑名单、改一个风险分数阈值，都需要走发版流程——测试、Review、发布，最快也要几个小时。

把规则放数据库，运营团队可以通过管理界面实时调整，30 秒内全部实例生效。但需要注意：

**DB 规则不能完全替代内置规则**——数据库可能出故障，缓存可能失效。内置规则是不依赖任何外部状态的最后防线，哪怕整个数据库宕机，最基础的安全规则也能正常工作。

### 6.3 为什么审计日志要做双队列而不是直接写 DB

审计日志的写入频率很高（每次工具调用都写），如果同步写 DB，会增加工具调用链路的延迟。但如果完全异步不管，一旦数据库出现问题，合规日志就丢失了。

双队列方案的核心思路：**根据日志的合规重要性分级处理**。BLOCK/HITL 这类"证明系统做了安全检查"的日志是合规必须项，宁可写本地文件降级，也不能丢。纯运营分析日志在系统压力大时可以丢弃。

### 6.4 热开关为什么不支持 API 运行时切换

早期版本支持通过 API 动态切换 Guard 层状态，后来移除了。原因：

- API 切换的状态保存在内存里，服务重启后失效——出了事情、重启了服务，安全开关却悄悄恢复为默认值
- 多实例部署时，通过 API 只能切换一个实例，其他实例的状态不一致
- 配置中心（Lion）天然支持多实例广播、变更历史追踪、权限控制

统一走配置中心管理，状态持久化且全实例一致。

### 6.5 语义检测为什么是"可选兜底"而不是"主力"

LLM 语义检测精度最高，但调用一次 LLM 需要几十到几百毫秒，在入口层这样的高频路径上代价不小。

规则已经高置信度命中（HIGH/CRITICAL）时，跳过语义检测——已经确定是攻击了，再花 Token 确认是浪费。只有规则层面没有强信号时，才用语义检测做兜底。

这个设计让 IntentGuard 的平均耗时控制在合理范围，只有真正"规则说不清楚"的模糊请求才走 LLM 通道。

---

## 7. 端到端流程全览

以"用户发送一条指令，Agent 触发一个高风险工具调用，需要 HITL 确认"为例：

```
用户               入口层                  AgentLoop/ToolExecutor     工具执行
 │                   │                           │                       │
 │── 发送消息 ───────▶│                           │                       │
 │                   │── IntentGuard.check() ─────                       │
 │                   │   [四环流水线]                                     │
 │                   │   结果: ALLOW                                      │
 │                   │── SkillGuard.isAllowed() ──                       │
 │                   │   结果: ALLOW                                      │
 │                   │── 转发消息到 AgentLoop ──────▶│                   │
 │                   │                              │── LLM 推理         │
 │                   │                              │← 决定调用工具 X    │
 │                   │                              │                    │
 │                   │                    OperationGuard.check()         │
 │                   │                    [PermissionChecker: PASS]      │
 │                   │                    [RuleEngine: HITL 命中]        │
 │                   │                    [HITLInterceptor: 生成Token]   │
 │                   │                              │                    │
 │◀── HITL 确认通知 ──│◀─────────────────────────── │                   │
 │   （含操作摘要）    │                              │← [Agent 挂起等待] │
 │                   │                              │                    │
 │── 点击"确认" ──────▶│                             │                    │
 │                   │── POST /api/hitl/confirm ────▶│                   │
 │                   │                              │← [Promise resolve] │
 │                   │                    ResourceGuard.check()          │
 │                   │                    [Budget: 未超限 ALLOW]         │
 │                   │                    [CircuitBreaker: CLOSED ALLOW] │
 │                   │                              │── 执行工具 X ──────▶│
 │                   │                              │◀── 工具结果 ────────│
 │                   │                              │                    │
 │                   │              AuditLogger.push(hitl_event)        │
 │                   │              AuditLogger.push(tool_use)          │
 │                   │                              │                    │
 │◀── 最终回复 ────────│◀─────────────────────────── │                   │
```

---

## 后记

Harness 从最初的"临时加几个 if"，演化成今天这套四层纵深防御框架，前后经历了约三个月、多轮重构。

最大的收获不是框架本身的代码量，而是在这个过程中把"AI Agent 的边界应该在哪里"这个问题想清楚了：

- 边界不是一刀切的黑名单，而是**动态感知的多层次决策**
- 边界不是越严越好，**误拦截的代价和漏拦截的代价一样需要考量**
- 边界的可观测性（observe 模式、审计日志）和边界本身一样重要
- **规则的灵活性**（数据库动态规则、热开关）决定了框架能不能在生产中真正用起来

如果你也在做 Agent 平台，希望这篇文章能给你提供一些参考。欢迎交流。
