# 如何为基于 WebSocket 的 AI Agent 构建自动化测评系统

> **背景**：本文基于一个真实的企业级 AI Agent 平台的工程实践。这类 AI Agent 可以理解用户的自然语言指令，自主规划并调用各种后端工具完成复杂的多步骤业务操作——就像一个"会干活的智能助手"，你告诉它做什么，它自己想好怎么做并执行。为了系统性验证 Agent 的执行能力，从零设计并实现了这套端到端自动化测评后端服务。

---

## 目录

1. [为什么要做测评系统，难在哪里](#1-为什么要做测评系统难在哪里)
2. [整体架构](#2-整体架构)
3. [核心模块详解](#3-核心模块详解)
   - [CaseParserAgent — 测评用例生成器](#31-caseparseragent--测评用例生成器)
   - [EvalCaseRunner — 用例执行器](#32-evalcaserunner--用例执行器)
   - [Judge — 评判引擎](#33-judge--评判引擎)
   - [EvalOrchestrator — 调度器](#34-evalorchestrator--调度器)
   - [EvalService — 服务入口](#35-evalservice--服务入口)
4. [两个关键技术点](#4-两个关键技术点)
   - [Promise 挂起/恢复：处理流式 WS 响应](#41-promise-挂起恢复处理流式-ws-响应)
   - [LLM 驱动的智能追问](#42-llm-驱动的智能追问)
5. [数据模型设计](#5-数据模型设计)
6. [REST API 设计](#6-rest-api-设计)
7. [逐步执行模式的演进](#7-逐步执行模式的演进)
8. [关键设计决策与 Trade-off](#8-关键设计决策与-trade-off)
9. [端到端流程全览](#9-端到端流程全览)


---

## 1. 为什么要做测评系统，难在哪里

### 背景

想象一个"智能工作助手"：用户用一句话描述需求，它就能自动拆解任务、依次调用后端服务、处理过程中的各种情况，最终给出结果。比如用户说"帮我查一下上周的销售数据，整理成报表发给张总"，Agent 会自己判断要先查询数据库、再调用报表生成工具、最后走发送邮件的 API，整个过程不需要用户逐步指引。

这类 Agent 支持的业务场景越来越多之后，需要一套系统来回答：**Agent 在各种场景下的执行能力到底怎么样？**

| 问题 | 没有测评系统时 | 有测评系统后 |
|------|--------------|-------------|
| 验证 Agent 能力 | 手动一条一条发消息测 | 批量自动化执行，无人值守 |
| 改了代码做回归 | 不知道影响了哪些场景 | 标准化用例库 + 可重复执行 |
| 测评报告 | 靠人工记录 | 自动生成通过率 / 各维度评判 |
| 用例管理 | 散落在文档/群聊里 | 结构化用例库，可复用 |

### 核心挑战：这不是普通的 HTTP 接口测试

传统 HTTP 接口测试（`request → response`）不适用于这类 Agent，原因有三：

**① 响应是流式的**：Agent 输出通过 WebSocket 流式推送，消息分散在多帧中（`thinking`、`text_delta`、`tool_start`、`tool_result`...），没有一个明确的"返回值"，也不知道什么时候 Agent 才算"回答完了"。

**② 响应时间极不确定**：一个简单查询可能 3 秒返回，一个复杂的多工具调用场景可能需要 3 分钟，中间还会有多轮工具调用穿插。

**③ 存在交互型中间事件**：Agent 执行过程中会暂停并等待外部响应——
- **HITL（Human In The Loop，人工介入）**：某些涉及资金或敏感数据的操作，Agent 会在执行前弹出确认请求，等用户点"确认"才继续，防止误操作。就像转账前的二次确认弹窗。
- **front_action（前端动作）**：Agent 需要依赖浏览器页面完成某些步骤（比如填写并提交一个表单），它会发消息通知前端去执行，等前端回传结果后才继续。

测评系统必须能**自动模拟这些交互响应**，Agent 才不会卡在等待中超时失败。

---

## 2. 整体架构

```
用户/前端                           后端测评服务
 │                                    │
 │── POST /api/eval/parse ───────────▶│ CaseParserAgent
 │        (传入文档/用例描述)          │   ├── 拉取文档内容
 │◀── { datasetId, status:"parsing" }─│   └── LLM 解析 → EvalCase[]
 │                                    │              ↓ 持久化到 DB
 │── GET /api/eval/dataset/:id ───────▶│ 查询解析状态
 │◀── { status:"success", cases:[] } ─│
 │                                    │
 │── POST /api/eval/start ────────────▶│ EvalOrchestrator
 │◀── { runId } ──────────────────────│   ├── CaseRunner-1 ──▶ WS ──▶ Agent
 │                                    │   ├── CaseRunner-2 ──▶ WS ──▶ Agent
 │── GET /api/eval/progress/:runId ──▶│   └── CaseRunner-N ──▶ WS ──▶ Agent
 │◀── SSE 实时进度流 ─────────────────│                ↓
 │                                    │       Judge（评判引擎）
 │── GET /api/eval/report/:runId ─────▶│ 查询测评报告
 │◀── { passed:4, failed:1, ... } ────│
```

### 模块职责一览

| 模块 | 文件 | 职责 |
|------|------|------|
| `CaseParserAgent` | `case-parser.service.ts` | 文档/描述 → 结构化 `EvalCase[]` |
| `EvalCaseRunner` | `case-runner.ts` | 持有 WS 连接，执行单个用例的完整生命周期 |
| `Judge` | `judge.ts` | 多维度评判 Agent 输出（关键词 + 工具调用 + 语义） |
| `EvalOrchestrator` | `orchestrator.ts` | 并发调度多个 Runner + SSE 进度推送 + 报告汇总 |
| `EvalService` | `eval-service.ts` | HTTP 入口，编排以上所有模块 |
| `ProgressEmitter` | `progress-emitter.ts` | 内存事件总线，驱动 SSE 实时进度推送 |

---

## 3. 核心模块详解

### 3.1 CaseParserAgent — 测评用例生成器

**职责**：给定一份描述业务场景的文档（内部使用知识库文档，也可以替换为任意 Markdown/文本来源），通过 LLM 自动解析出结构化的测评用例数组。

> **为什么用 LLM 而不是人工填写？** 业务场景的描述通常以自然语言表格或文本形式存在，用 LLM 解析比设计固定模板更灵活，支持各种格式的输入文档。

**执行流程**：

```
文档 URL / 文本内容
  ↓
拉取文档内容（Markdown/纯文本）
  ↓
构建 LLM 解析 Prompt（注入文档内容）
  ↓
LLM 调用：temperature=0.1, maxTokens=8000
  ↓
多策略 JSON 提取（容错）：
  策略1: 正则匹配 ```json ... ``` 代码块
  策略2: 正则匹配 [...] 数组
  策略3: tryRepairTruncatedJson（LLM 输出被截断时修复）
  ↓
validateAndNormalize()：补全默认值
  ↓
返回 EvalCase[]
```

**解析 Prompt 的设计思路**：

```
你是一个测评用例解析专家。请从以下文档中提取所有可执行的测评用例。

解析规则：
1. 每个独立的业务操作场景对应一个 EvalCase
2. 提取 prompt：用户发给 Agent 的完整指令（有明确文本则直接用，否则根据场景生成）
3. 提取 objective：测评目标（一句话概括）
4. 推断 steps：Agent 完成任务预期的关键步骤
5. supplementaryData：Agent 追问时可以使用的补充信息
```

**解析产出的 EvalCase 结构**：

```json
{
  "id": "case-001",
  "role": "普通用户",
  "scenario": "查询并发送周报",
  "prompt": "帮我把上周的销售数据整理成报表，发给张总的邮箱",
  "objective": "验证 Agent 能否正确完成数据查询 → 报表生成 → 邮件发送的完整流程",
  "supplementaryData": {
    "recipientEmail": "zhang@example.com",
    "dateRange": "2026-05-26 ~ 2026-06-01"
  },
  "steps": [
    {
      "id": 1,
      "description": "查询上周销售数据",
      "expectedOutput": "已获取销售数据",
      "expectedTools": ["query-sales-data"],
      "mustContain": ["销售数据"]
    },
    {
      "id": 2,
      "description": "生成报表并发送邮件",
      "expectedOutput": "邮件已成功发送给张总",
      "expectedTools": ["generate-report", "send-email"],
      "mustContain": ["发送成功"]
    }
  ],
  "config": {
    "hitlStrategy": "auto_approve",
    "stepTimeoutMs": 120000,
    "totalTimeoutMs": 300000
  }
}
```

**异步解析模式**（v2.0 重构）：

LLM 解析耗时 30~60 秒，若接口同步等待，HTTP 连接会超时。因此改为异步模式：

```
POST /api/eval/parse
  └── ① 立即：在 DB 创建一条 status=parsing 的记录
  └── ② 后台：setImmediate(() => this.runBackgroundParse())
  └── ③ 返回：{ datasetId, status: "parsing" }  ← 毫秒级返回

  ......（后台 30~60s 后）......

  解析成功 → 写入用例到 DB → 更新 status=success
  解析失败 → 更新 status=failed + errorMessage
```

前端通过轮询 `GET /api/eval/dataset/:id` 等待 `status=success`，随后可以查看用例列表。

---

### 3.2 EvalCaseRunner — 用例执行器

**这是测评系统最核心的模块**。每个 Runner 持有一条独立的 WebSocket 连接，负责执行单个用例的完整生命周期。

#### 执行模式选择

```
caseConfig.steps.length >= 2  →  逐步执行模式（step-by-step）
caseConfig.steps.length <= 1  →  一次性执行模式（旧版兼容）
```

#### 逐步执行模式（核心流程）

```
for each step in caseConfig.steps:

  a. 构造步骤输入
     - 第 1 步：发送 caseConfig.prompt（完整原始指令）
     - 第 N 步：发送 step.input（若已配置）或根据步骤描述构造引导语

  b. sendAndWait(input) → Promise 挂起，等待 Agent 完整响应
     （详见"4.1 Promise 挂起/恢复"）

  c. 追问处理循环（最多 3 轮）
     - 调用 LLM 判断：Agent 是否在等用户提供信息才能继续？
     - 如果是 → LLM 生成合适回复 → 再次 sendAndWait
     （详见"4.2 LLM 驱动的智能追问"）

  d. judge.stepLevelJudge(step, responses) → 步骤级评判

  e. 记录 StepResult（pass/fail + 各维度原因 + 执行耗时）

  f. 如果 !pass → 停止后续步骤，记录 failedAtStep
```

#### WS 消息分类处理

Agent 的所有输出通过 `handleMessage()` 按消息类型分流处理：

| 消息类型 | 处理方式 | 说明 |
|----------|----------|------|
| `thinking` | 累积到 `currentTurnThinking` | Agent 思考过程（不对外展示，用于 debug） |
| `text_delta` | 累积到 `currentTurnText` | Agent 回复文本，流式拼接 |
| `tool_start` | push 到 `currentTurnTools` | 某个工具被调用 |
| `tool_result` | 更新对应 tool 的 result | 工具调用结果 |
| `compaction` | 忽略 | 历史消息压缩通知（无需处理） |
| `hitl_request` | **自动批准** → 发送 `confirm(approve)` | ★ HITL 人工确认自动化 |
| `front_action` | **自动返回成功** → 发送 `front_action_result` | ★ 前端操作自动化 |
| `turn_end` | **emit('turn_end')** → 解除 Promise 挂起 | ★ 驱动执行流恢复的关键信号 |
| `error` | emit('ws_error') → Promise reject | Agent 报错 |

---

### 3.3 Judge — 评判引擎

**职责**：对 Agent 的实际输出做多维度评判，返回 `pass/fail` 及各维度详细理由。

#### 两种评判粒度

- **`stepLevelJudge`**（逐步骤）：针对单个 `EvalStep` 独立评判，是 v2.0 的核心评判方式
- **`judge`**（全量回退）：对所有响应一次性评判，兼容无 steps 定义的用例

#### 三个评判维度

| 维度 | 实现 | 是否参与 pass/fail 强制判定 |
|------|------|--------------------------|
| `keyword` 关键词匹配 | `fullText.includes(kw)` | ❌ 仅作参考 |
| `tool_call` 工具调用 | 比对 `expectedTools` vs 实际调用 | ✅ 核心维度（AND 逻辑） |
| `semantic` 语义评判 | LLM 判断是否满足 `expectedOutput` | ✅ 核心维度（AND 逻辑） |

**为什么关键词维度不参与强制判定？**

Agent 可以用不同的自然语言表达相同的结果——"邮件发送成功"和"已为您把报表发给张总"语义完全相同，但字面不匹配。强制关键词匹配会产生大量误判 fail，所以关键词维度只保留为**参考信息**，帮助人工 review 时快速定位问题。

#### LLM 语义评判 Prompt（宽松原则）

```
评判标准：
- 语义满足即可，不要求文字完全匹配
- 关注本步骤的核心目标是否达成
- Agent 的回复合理、相关、有信息量，即使格式不同也应判 pass
- 只有以下情况才判 fail：
  1. 回复内容与预期完全不相关（答非所问）
  2. 回复明显包含错误信息
  3. Agent 明确表示无法完成或报错
```

输出格式：
```json
{"pass": true, "reason": "Agent 成功调用了发送邮件工具，输出中包含了邮件发送确认信息，满足步骤预期"}
```

---

### 3.4 EvalOrchestrator — 调度器

**职责**：并发调度多个 CaseRunner，汇总报告，通过 SSE 实时推送进度事件。

**关键机制**：

```typescript
// 并发控制：用 p-limit 限制同时运行的 Runner 数量（默认3）
const limit = pLimit(concurrency ?? 3);

// 内存运行注册表：存储每个 runId 的运行上下文
const runRegistry = new Map<string, RunContext>();
```

每个 `RunContext` 包含：

```typescript
{
  runId: string;
  status: EvalRunStatus;
  cases: EvalCase[];
  results: EvalCaseResultItem[];
  activeRunners: Set<EvalCaseRunner>;  // 用于强制停止时关闭所有 WS 连接
  abortController: AbortController;    // 中止信号，propagate 到各 Runner
  progressEmitter: ProgressEmitter;    // SSE 事件推送
}
```

**执行流程**：

```
start(cases, config)
  ↓
① 在 DB 创建运行记录（status=running）
② 立即返回 { runId, status: "started" }  ← 不阻塞！
③ 后台异步：executeCases(ctx, concurrency)
    ├── p-limit 并发调度所有 case
    ├── for each case:
    │     新建 EvalCaseRunner
    │     runner.execute() → result
    │     writeCaseResult(DB)
    │     progressEmitter.emit('case_done')
    └── finalizeRun()
          ├── 汇总 passed/failed/passRate
          ├── 更新 DB（status=completed）
          └── progressEmitter.emit('run_complete')
```

**停止（stop）支持两种场景**：

```
场景1：进程内存中有上下文（正常路径）
  └── abortController.abort() → 各 Runner 的 totalTimer 触发 → WS 连接关闭

场景2：进程重启后内存丢失（降级兜底）
  └── 直接查 DB 确认状态 → 更新 DB status=stopped
```

---

### 3.5 EvalService — 服务入口

作为薄层编排，`EvalService` 是路由层的唯一调用入口：

| 方法 | 说明 |
|------|------|
| `submitParse(url, userId, token)` | 提交异步解析任务，返回 datasetId |
| `getDataset(datasetId)` | 查询测评集详情（含完整用例列表） |
| `getDatasetList(options)` | 测评集列表（分页 + 状态筛选） |
| `startByDatasetId(request, userId, token)` | 基于 datasetId 从 DB 加载用例并启动测评 |
| `start(cases, config, userId)` | 直接传 cases 数组启动（向后兼容） |
| `getReport(runId, verbose)` | 查询测评报告 |
| `stopEval(runId)` | 停止运行中的测评 |
| `deleteDataset(datasetId, userId)` | 删除测评集（应用层级联删除关联用例） |

> **关于懒加载 Orchestrator**：`EvalOrchestrator` 通过 `getOrchestrator()` 函数按需实例化单例，避免 `Service → Orchestrator → Runner → Service` 的循环依赖问题（在 Node.js 模块系统中，循环 require 会导致拿到空对象）。

---

## 4. 两个关键技术点

### 4.1 Promise 挂起/恢复：处理流式 WS 响应

**这是整个测评系统最核心的异步机制。**

**问题描述**：

Agent 的响应不是一次性返回的，而是通过 WebSocket 推送一系列流式消息。测评系统需要"发出消息 → 等待 Agent 处理完毕 → 拿到完整响应 → 决定下一步动作"，这需要把流式消息流转换为可以 `await` 的单次调用。

**解决方案：`sendAndWait()` + `EventEmitter` 信号量**

```typescript
private sendAndWait(content: string, timeoutMs: number): Promise<TurnResponse> {
  // 清空本轮流式累积状态
  this.currentTurnText = '';
  this.currentTurnTools = [];

  return new Promise<TurnResponse>((resolve, reject) => {
    // 1. 超时兜底：超时就 reject
    const timer = setTimeout(
      () => reject(new Error(`Agent 响应超时 (${timeoutMs}ms)`)),
      timeoutMs,
    );

    // 2. 监听 turn_end 信号（一次性，只触发一次）
    this.emitter.once('turn_end', (stopReason: string) => {
      clearTimeout(timer);
      resolve({
        text: this.currentTurnText,      // ← 流式拼接的完整回复
        thinking: this.currentTurnThinking,
        tools: [...this.currentTurnTools], // ← 本轮所有工具调用
        stopReason,
      });
    });

    // 3. 监听错误信号（一次性）
    this.emitter.once('ws_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    // 4. 发送消息，当前 Promise 进入挂起状态，等待上面两个事件之一触发
    this.ws.send(JSON.stringify({
      type: 'chat',
      payload: { message: { role: 'user', content } },
    }));
  });
}
```

**`onmessage` 同时在后台持续处理流式消息，并在收到 `turn_end` 时发出信号**：

```typescript
private handleMessage(msg: WsEnvelope): void {
  switch (msg.type) {
    case 'text_delta':
      this.currentTurnText += msg.payload.delta;  // 累积文本
      break;
    case 'tool_start':
      this.currentTurnTools.push({ name: msg.payload.toolName, ... });
      break;
    case 'hitl_request':
      this.autoApproveHitl(msg.payload.hitlRequestId); // 自动批准，不解除挂起
      break;
    case 'front_action':
      this.sendFrontActionResult(msg.payload.stepId);  // 自动返回成功，不解除挂起
      break;
    case 'turn_end':
      this.emitter.emit('turn_end', msg.payload.stopReason); // ★ 解除 Promise 挂起
      break;
    case 'error':
      this.emitter.emit('ws_error', new Error(msg.payload.message));
      break;
  }
}
```

**完整时序图**：

```
sendAndWait()                onmessage（后台持续触发）
     │
     │ [Promise 挂起]
     │                  ← thinking（累积，不解除挂起）
     │                  ← text_delta × N（累积，不解除挂起）
     │                  ← tool_start（记录，不解除挂起）
     │                  ← tool_result（更新，不解除挂起）
     │                  ← hitl_request（自动 approve，不解除挂起）
     │                  ← front_action（自动返回 success，不解除挂起）
     │                  ← turn_end  ★
     │                       ↓
     │            emitter.emit('turn_end')
     │                       ↓
     │ [Promise resolve!]
     │ 拿到完整 TurnResponse
     │ → 继续执行后续步骤 / 评判 / 追问
```

**为什么用 `EventEmitter` 而不是直接在 `onmessage` 里 `resolve`？**

同一条 WS 连接要处理多轮对话（每个 step 一轮）。`emitter.once()` 确保**只在本次 `sendAndWait` 调用期间监听一次 `turn_end`**，下一轮调用时注册新的 `once` 监听器。如果直接在 `onmessage` 里 `resolve`，多轮对话之间的信号会互相干扰。

---

### 4.2 LLM 驱动的智能追问

**问题描述**：

Agent 在执行过程中有时信息不够，会反过来追问用户（例如"请问您要发给谁？邮箱地址是什么？"）。如果测评系统不回应，Agent 就会卡在等待中，整个 Case 超时失败。测评系统需要自动识别追问并给出合适的回复。

**设计方案：LLM 语义判断 + 启发式规则降级**

```typescript
async shouldFollowUp(response: TurnResponse, caseConfig: EvalCase): Promise<FollowUpDecision> {

  // 快速短路：空回复直接不追问
  if (!response.text) return { shouldFollowUp: false };

  // ① 调用 LLM 做语义判断（temperature=0，确定性输出）
  const prompt = `
    判断：被测 Agent 回复后，测评系统（扮演用户）是否需要继续回复？

    核心判断标准：
    - 如果用户不回复，Agent 就会卡住等待 → needsReply=true
    - 如果 Agent 已经给出最终结果（无论成功/失败） → needsReply=false

    Agent 当前回复：${response.text}
    原始任务：${caseConfig.prompt}

    输出 JSON：
    {
      "needsReply": true/false,
      "reason": "一句话原因",
      "suggestedReply": "如果需要回复，给出具体内容"
    }
  `;

  try {
    const result = await llm.complete(prompt);
    return { shouldFollowUp: result.needsReply, suggestedReply: result.suggestedReply };
  } catch {
    // ② LLM 失败时降级到启发式规则
    return this.heuristicShouldFollowUp(response);
  }
}

// 启发式规则（降级兜底）
private heuristicShouldFollowUp(response: TurnResponse): FollowUpDecision {
  // 检测到完成信号 → 不追问
  if (/已完成|创建成功|操作成功|执行完毕/.test(response.text)) {
    return { shouldFollowUp: false };
  }
  // 检测到疑问信号 → 追问
  if (/[？?]|请提供|请确认|请告诉|请问/.test(response.text)) {
    return { shouldFollowUp: true };
  }
  return { shouldFollowUp: false };
}
```

**追问回复生成（三级降级策略）**：

```
优先级1: LLM shouldFollowUp 判断时已顺带生成 suggestedReply（最优）
优先级2: 查找 case 预设的 supplementaryData（case 级配置兜底）
优先级3: 单独调用 LLM 根据 Agent 提问内容生成回复
优先级4: 兜底文本 "请继续完成任务。目标：{objective}"
```

最多追问 `MAX_FOLLOW_UP_ROUNDS = 3` 轮，超过则标记该步骤失败。

---

## 5. 数据模型设计

### 5.1 四张核心表

```
eval_dataset          — 测评集（一次文档解析 = 一个 dataset）
eval_dataset_case     — 测评用例（dataset 下的 N 个 case）
eval_run              — 测评运行记录（一次执行 = 一个 run）
eval_case_result      — 用例执行结果（run 下每个 case 的结果）
```

### 5.2 关系图

```
dataset (1) ──── (N) dataset_case   ← 解析阶段产物，可复用
                         ↓
                 启动测评时加载
                         ↓
run (1) ──────── (N) case_result    ← 执行阶段产物
```

### 5.3 关键字段说明

**`eval_dataset`**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dataset_id` | VARCHAR(64) | `ds_` 前缀 UUID，业务主键 |
| `status` | VARCHAR(16) | `parsing` / `success` / `failed` |
| `source_url` | VARCHAR(512) | 来源文档 URL |
| `total_cases` | INT | 解析出的用例总数 |
| `parse_metadata` | JSON | 解析元信息（使用的模型、耗时、解析时间等） |

**`eval_case_result`**（包含 v2.0 扩展字段）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `session_id` | VARCHAR(64) | Agent 会话 ID，用于回溯查看具体对话内容 |
| `verdict` | JSON | 综合评判结论（含各维度 pass/reason） |
| `step_results` | JSON | 逐步骤评判结果（`StepResult[]`），v2.0 新增 |
| `current_step_index` | INT | 执行到的步骤（1-based），用于展示进度 |
| `failed_at_step` | INT | 失败在哪一步（-1 表示非步骤级失败） |
| `follow_up_rounds` | INT | 追问轮数，用于分析 |

> **关于外键**：表间关系通过应用层级联维护（先删子表记录再删主表），而不是数据库外键。原因是外键在高并发下有锁竞争问题，并且 DDL 变更（如加列）时处理起来更麻烦。

---

## 6. REST API 设计

所有接口统一前缀 `/api/eval/`，通过 Cookie 中的 SSO Token 做认证鉴权。

### API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/eval/parse` | 提交文档异步解析任务 |
| GET | `/api/eval/datasets` | 测评集列表（分页 + 状态筛选） |
| GET | `/api/eval/dataset/:datasetId` | 测评集详情（含完整用例列表） |
| DELETE | `/api/eval/dataset/:datasetId` | 删除测评集 |
| GET | `/api/eval/runs` | 测评运行记录列表 |
| POST | `/api/eval/start` | 启动测评（datasetId 模式或 cases 模式） |
| GET | `/api/eval/progress/:runId` | **SSE** 实时进度推送 |
| GET | `/api/eval/report/:runId` | 查询测评报告 |
| POST | `/api/eval/stop/:runId` | 停止运行中的测评 |

### 启动测评的两种模式

**模式 A（推荐）：基于 datasetId**

用于已经解析并持久化的用例集。支持 `runCount` 多遍执行，适合回归场景。

```json
POST /api/eval/start
{
  "datasetId": "ds_550e8400-...",
  "runCount": 3,
  "concurrency": 5
}
```

**模式 B（兼容）：直接传 cases 数组**

适合程序化动态生成用例的场景，不依赖 DB。

```json
POST /api/eval/start
{
  "cases": [...],
  "config": { "targetWsUrl": "ws://...", "teamId": "1", "concurrency": 3 }
}
```

### 典型使用流程（前端伪代码）

```typescript
// Step 1: 提交解析（立即返回，不需要等待）
const { data: { datasetId } } = await post('/api/eval/parse', { url: docUrl });

// Step 2: 轮询解析状态（每 3s 查一次）
const poll = setInterval(async () => {
  const { data } = await get(`/api/eval/dataset/${datasetId}`);
  if (data.status === 'success') {
    clearInterval(poll);

    // Step 3: 启动测评
    const { data: { runId } } = await post('/api/eval/start', { datasetId, runCount: 1 });

    // Step 4: 订阅 SSE 实时进度
    const es = new EventSource(`/api/eval/progress/${runId}`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === 'run_complete') {
        es.close();
        // Step 5: 获取最终报告
        const report = await get(`/api/eval/report/${runId}`);
      }
    };
  }
}, 3000);
```

### SSE 事件类型

```
data: {"type":"case_start",   "caseId":"case-001","data":{"index":1,"totalCases":5}}
data: {"type":"case_done",    "caseId":"case-001","status":"pass","data":{"stepCount":3,"totalSteps":3}}
data: {"type":"run_complete", "status":"completed","data":{"passed":4,"failed":1,"passRate":0.8}}
```

---

## 7. 逐步执行模式的演进

### v1.0 — 一次性模式

```
发送 case.prompt → 等待 turn_end → 全局评判（关键词 + 工具调用 + 语义）
```

**缺点**：只有一个整体的 pass/fail 结论，无法定位具体哪一步失败；LLM 语义评判时上下文包含全部响应，噪声多，判断准确率下降。

### v2.0 — 逐步执行模式（step-by-step）

```
for each step:
  发送 step 输入 → 等待 turn_end → 步骤级评判
  如果失败 → 记录 failedAtStep → 停止
同时生成全局 verdict（向后兼容展示逻辑）
```

**优势**：
- **精确定位**：知道是第几步失败，方便定向排查
- **细粒度评判**：每步独立打分，`failedAtStep` 字段直接指出问题位置
- **更高准确率**：LLM 语义评判只看当前步骤的 `expectedOutput`，基准更清晰、上下文更短

### 向后兼容设计

```typescript
// case-runner.ts
const hasSteps = caseConfig.steps && caseConfig.steps.length >= 2;

if (hasSteps) {
  return await this.executeStepByStep(caseConfig, ...);  // v2 逐步执行
} else {
  return await this.executeLegacy(caseConfig, ...);       // v1 兼容（无 steps 定义的旧用例）
}
```

---

## 8. 关键设计决策与 Trade-off

### 8.1 为什么用异步解析而不是同步

| 方案 | 优点 | 缺点 |
|------|------|------|
| **同步解析**（v1.0） | 实现简单，一个请求搞定 | 前端等待 30~60s，HTTP 超时风险；解析失败没有持久化 |
| **异步解析**（v2.0，选用） | 立即返回，无超时风险 | 需要轮询；需要 DB 持久化记录状态 |

异步模式的额外好处：**用例可复用**——同一份文档解析一次，可以多次触发执行，不需要重新解析。

### 8.2 为什么 LLM 追问判断要有降级策略

LLM 调用不是 100% 可靠的（网络超时、模型限速、输出格式不符等都会导致调用失败）。测评执行过程中任何一个 LLM 调用失败都不应该导致整个 Case 失败，所以设计了**多级降级**：

```
LLM shouldFollowUp 调用失败
  → 降级到启发式规则（关键词匹配）
    → 最坏情况：默认不追问，继续向下执行
```

整体原则：**测评逻辑自身的故障不应影响被测 Agent 的评判结果**。

### 8.3 为什么关键词维度不参与强制判定

```typescript
// judge.ts - 只有 tool_call 和 semantic 参与强制判定
const coreDimensions = results.filter((r) => r.dimension !== 'keyword');
const pass = coreDimensions.every((r) => r.pass);
```

自然语言生成具有多样性：Agent 说"报表已发送至您指定的邮箱"和"邮件发送成功"语义相同，但关键词"发送成功"只匹配后者。强制匹配会产生大量误判 fail，所以关键词维度只用于辅助人工 review，不参与判定逻辑。

### 8.4 内存 RunRegistry + DB 双写的取舍

| 存储 | 用途 | 生命周期 |
|------|------|---------|
| 内存 `RunRegistry` | 实时控制（stop、ProgressEmitter、activeRunners） | 5 分钟后自动清理 |
| DB `eval_run` | 持久化历史、服务重启降级、报告查询 | 永久保留 |

两者互补：内存用于实时高频操作（避免 DB I/O 瓶颈），DB 用于持久化和容灾。代价是需要维护两者的一致性（每次状态变更都要同时更新内存和 DB）。

### 8.5 p-limit 而不是手写并发池

使用 `p-limit` 做并发控制，而不是自己维护信号量，原因：

- `p-limit` 经过充分测试，处理了各种边缘情况（Promise rejection 传播、队列排空等）
- 代码可读性更好：`limit(async () => { ... })` 一行搞定并发控制
- 支持动态调整并发数（只需重新创建 `limit` 实例）

---

## 9. 端到端流程全览

```
用户/前端              EvalService         CaseRunner          Agent(WS)          Judge
 │                         │                   │                   │                 │
 │── POST /parse ─────────▶│                   │                   │                 │
 │◀── { datasetId } ───────│                   │                   │                 │
 │                         │── 后台解析 ────────────────────────────────────────────▶│
 │                         │   (LLM解析文档→EvalCase[])                              │
 │                         │── 写入 DB ─────────────────────────────────────────────│
 │── GET /dataset/:id ─────▶│                  │                   │                 │
 │◀── { status:"success" } ─│                  │                   │                 │
 │                         │                   │                   │                 │
 │── POST /start ──────────▶│                  │                   │                 │
 │◀── { runId } ────────────│                  │                   │                 │
 │                         │── p-limit并发 ────▶│                   │                 │
 │── GET /progress/:runId ─▶│(SSE长连接)        │── ws.connect() ──▶│                 │
 │◀── case_start event ─────│                  │◀── connected ──────│                 │
 │                         │                   │── sendAndWait ─────▶│                │
 │                         │                   │   [Promise挂起]   │                 │
 │                         │                   │◀── thinking ───────│                 │
 │                         │                   │◀── text_delta × N ─│                 │
 │                         │                   │◀── tool_start ─────│                 │
 │                         │                   │◀── hitl_request ───│                 │
 │                         │                   │── confirm(approve)─▶│                │
 │                         │                   │◀── front_action ───│                 │
 │                         │                   │── fa_result ───────▶│                │
 │                         │                   │◀── turn_end ★ ─────│                 │
 │                         │                   │  [Promise resolve!]│                 │
 │                         │                   │── judge ───────────────────────────▶│
 │                         │                   │◀── StepVerdict ────────────────────── │
 │◀── case_done event ──────│                  │                   │                 │
 │◀── run_complete event ───│                  │                   │                 │
 │                         │                   │                   │                 │
 │── GET /report/:runId ───▶│                  │                   │                 │
 │◀── { passed:4, failed:1, passRate:0.8 } ───│                   │                 │
```


