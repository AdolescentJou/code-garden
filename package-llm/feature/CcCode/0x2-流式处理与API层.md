# 0x2 流式处理与 API 层——从字节流到结构化消息

> *系列：Claude Code 源码深度研究 · 专题 02 *
> *版本：v2.1.88 · 文件：*`*src/services/api/claude.ts*`* · *`*src/services/api/withRetry.ts*`* · *`*src/services/api/client.ts*`

---

### 一、从一个字符说起

Claude 在回复你的时候，第一个字是怎么出现在屏幕上的？

表面上看，Claude Code 发了一个 HTTP 请求，API 返回了文本，然后打印出来——不就这样吗？

但真实的链路远比这复杂。API 返回的不是文本，而是一条持续推送的 SSE 字节流；Claude Code 必须实时解析这条流，把碎片化的事件重建成结构化的消息，同时还要应对：工具调用的 JSON 参数分片传输、`stop_reason` 在流结束才到达、网络随时可能断开、连接可能静默挂死而毫无提示。

这篇文章要带你深入 Claude Code 的 API 层，看清楚每一个字符从 Anthropic 服务器到你终端屏幕的完整旅程。

---

### 二、SSE 流的事件序列

一次完整的 API 调用，SSE 流的事件序列如下：

```TypeScript
message_start
  └─ { message: { id, model, usage: { input_tokens, ... } } }

content_block_start (index=0, type="text")
content_block_delta (index=0, type="text_delta", delta.text="Hello")
content_block_delta (index=0, type="text_delta", delta.text=" world")
content_block_stop  (index=0)

content_block_start (index=1, type="tool_use", name="bash", id="toolu_xxx")
content_block_delta (index=1, type="input_json_delta", delta.partial_json='{"cmd')
content_block_delta (index=1, type="input_json_delta", delta.partial_json='":"ls"}')
content_block_stop  (index=1)

message_delta
  └─ { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } }

message_stop
```

关键点：**每个 content block 独立编号（index），并发 yield**。一条 assistant 消息可能包含多个 content block，每个 block 在 `content_block_stop` 时单独 yield 为一条 `AssistantMessage`。

---

### 三、为什么不用 BetaMessageStream

`@anthropic-ai/sdk` 提供了 `BetaMessageStream` 高级封装，但 Claude Code 没有用它，而是直接操作原始 `Stream<BetaRawMessageStreamEvent>`。源码注释解释了原因：

```TypeScript
// Use raw stream instead of BetaMessageStream to avoid O(n²) partial JSON parsing
// BetaMessageStream calls partialParse() on every input_json_delta, which we don't need
// since we handle tool input accumulation ourselves
```

`BetaMessageStream` 的问题：每收到一个 `input_json_delta`，它就调用 `partialParse()` 尝试解析整个已累积的 JSON 字符串。如果工具参数有 N 个 delta，就会解析 N 次，总工作量是 1+2+3+...+N = O(N²)。

Claude Code 的做法：用 `contentBlocks[index].input += delta.partial_json` 纯字符串拼接，只在 `content_block_stop` 时解析一次，O(N)。

```TypeScript
BetaMessageStream:
  delta_1 → parse("{"cmd")          → fail, discard
  delta_2 → parse('{"cmd":"ls"}')   → success ✓
  总解析次数: N 次

Claude Code:
  delta_1 → input += '{"cmd'
  delta_2 → input += '":"ls"}'
  block_stop → JSON.parse('{"cmd":"ls"}')  → 1 次
  总解析次数: 1 次
```

---

### 四、contentBlocks 状态机详解

`contentBlocks` 是一个数组，索引对应 SSE 事件中的 `index` 字段。每个 block 的生命周期：

```TypeScript
content_block_start
    ├─ type="text"       → { type:"text", text:"" }
    ├─ type="tool_use"   → { type:"tool_use", input:"" }  // input 是字符串！
    ├─ type="thinking"   → { type:"thinking", thinking:"", signature:"" }
    └─ type="server_tool_use" → { type:"server_tool_use", input:"" }

content_block_delta
    ├─ text_delta        → contentBlock.text += delta.text
    ├─ input_json_delta  → contentBlock.input += delta.partial_json
    ├─ thinking_delta    → contentBlock.thinking += delta.thinking
    └─ signature_delta   → contentBlock.signature = delta.signature

content_block_stop
    → 构造 AssistantMessage，yield 出去
    → normalizeContentFromAPI() 把 input 字符串解析为对象
```

注意 `tool_use` 的 `input` 字段在累积阶段是**字符串**，在 `content_block_stop` 时才通过 `normalizeContentFromAPI()` 解析为 JSON 对象。这是为了避免 O(N²) 问题。

#### 4.1 message_delta 的"时间悖论"

这里有一个微妙的时序问题：

```TypeScript
content_block_stop (index=0)
    → 构造 AssistantMessage { usage: { output_tokens: 0 }, stop_reason: null }
    → yield m  ← 消费者已经拿到这条消息了

message_delta
    → usage.output_tokens = 42, stop_reason = "tool_use"
    → lastMsg.message.usage = usage      ← 直接 mutate 已 yield 的对象！
    → lastMsg.message.stop_reason = ...  ← 同上
```

消息在 `content_block_stop` 时 yield，但 `usage` 和 `stop_reason` 要等 `message_delta` 才到。Claude Code 的解决方案是**直接 mutate 已 yield 的对象**：

```TypeScript
// IMPORTANT: Use direct property mutation, not object replacement.
// The transcript write queue holds a reference to message.message
// and serializes it lazily (100ms flush interval). Object
// replacement ({ ...lastMsg.message, usage }) would disconnect
// the queued reference; direct mutation ensures the transcript
// captures the final values.
const lastMsg = newMessages.at(-1)
if (lastMsg) {
  lastMsg.message.usage = usage
  lastMsg.message.stop_reason = stopReason
}
```

这依赖于 JavaScript 的引用语义：写队列持有 `message.message` 的引用，100ms 后序列化时，读到的是 mutate 后的最终值。如果用 `{ ...lastMsg.message, usage }` 创建新对象，写队列的引用就断了，序列化的是旧值。

---

### 五、流式降级的完整决策树

当流式请求出现问题时，Claude Code 有一套完整的降级策略：

```TypeScript
流式请求异常
    │
    ├─ APIUserAbortError
    │   ├─ signal.aborted = true  → 用户按了 ESC，直接 throw，不降级
    │   └─ signal.aborted = false → SDK 内部超时，转换为 APIConnectionTimeoutError，进入降级
    │
    ├─ 流空闲超时（90s 无数据）
    │   → streamIdleAborted = true
    │   → throw Error("Stream idle timeout")
    │   → 进入降级
    │
    ├─ 其他流式错误（网络中断、代理错误等）
    │   ├─ CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK = true
    │   │   → 直接 throw，让 withRetry 处理
    │   └─ 默认
    │       → didFallBackToNonStreaming = true
    │       → executeNonStreamingRequest()
    │           → max_tokens 上限 64,000
    │           → 如果也失败 → yield 错误消息，return
    │
    └─ CannotRetryError（withRetry 耗尽重试次数）
        ├─ 404 且未降级过
        │   → 降级到 executeNonStreamingRequest()（某些代理不支持流式端点）
        └─ 其他
            → yield getAssistantMessageFromError()，return
```

非流式降级的 token 上限是 64,000（`MAX_NON_STREAMING_TOKENS`）：

```TypeScript
// Non-streaming requests have a 10min max per the docs
// The SDK's 21333-token cap is derived from 10min × 128k tokens/hour, but we
// bypass it by setting a client-level timeout, so we can cap higher.
export const MAX_NON_STREAMING_TOKENS = 64_000
```

---

### 六、流式空闲超时看门狗

这是一个精心设计的防挂死机制，值得单独讲解：

```TypeScript
const STREAM_IDLE_TIMEOUT_MS = 90_000  // 90 秒
const STREAM_IDLE_WARNING_MS = 45_000  // 45 秒警告

function resetStreamIdleTimer() {
  clearStreamIdleTimers()
  // 45 秒无数据 → 打印警告
  streamIdleWarningTimer = setTimeout(() => {
    logForDebugging('Streaming idle warning: no chunks for 45s', { level: 'warn' })
  }, STREAM_IDLE_WARNING_MS)
  // 90 秒无数据 → 主动 abort
  streamIdleTimer = setTimeout(() => {
    streamIdleAborted = true
    streamWatchdogFiredAt = performance.now()
    releaseStreamResources()  // abort stream.controller
  }, STREAM_IDLE_TIMEOUT_MS)
}

for await (const part of stream) {
  resetStreamIdleTimer()  // 每收到一个 chunk，重置计时器
  // ...
}
```

为什么需要这个机制？SDK 的 `timeout` 参数只覆盖初始 `fetch()` 的连接建立阶段，不覆盖流式 body 的读取。一旦连接建立后静默断开（TCP 连接存在但服务端停止发送数据），`for await` 会永远阻塞，Claude Code 就挂死了。

看门狗通过 `stream.controller.abort()` 主动终止流，让 `for await` 抛出异常，进入降级路径。

---

### 七、withRetry：重试的完整状态机

`withRetry` 是一个 AsyncGenerator，它管理着整个重试生命周期。

#### 7.1 重试决策矩阵

```TypeScript
错误类型                    | 是否重试 | 特殊处理
---------------------------|---------|------------------
401 Unauthorized           | 是      | 刷新 OAuth token，重新创建 client
403 OAuth token revoked    | 是      | 同上
403 Bedrock auth           | 是      | 清除 AWS 凭证缓存
401/403 Vertex auth        | 是      | 清除 GCP 凭证缓存
408 Request Timeout        | 是      | 标准退避
409 Lock Timeout           | 是      | 标准退避
429 Rate Limit             | 条件    | 非订阅用户重试；订阅用户不重试
529 Overloaded             | 条件    | 前台 source 重试；后台 source 直接失败
5xx Server Error           | 是      | 标准退避
ECONNRESET/EPIPE           | 是      | 禁用 keep-alive，重新连接
400 context overflow       | 是      | 调整 max_tokens，重试
其他 400                   | 否      | 直接失败
404                        | 否      | 直接失败（claude.ts 捕获后降级非流式）
```

#### 7.2 指数退避公式

```TypeScript
export function getRetryDelay(
  attempt: number,
  retryAfterHeader?: string | null,
  maxDelayMs = 32000,
): number {
  // 优先使用服务端的 retry-after header
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds)) return seconds * 1000
  }
  // 指数退避 + 25% 随机抖动
  const baseDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), maxDelayMs)
  const jitter = Math.random() * 0.25 * baseDelay
  return baseDelay + jitter
}
```

退避序列（BASE_DELAY_MS = 500ms，maxDelayMs = 32s）：

```TypeScript
attempt 1: 500ms  + jitter(0~125ms)
attempt 2: 1000ms + jitter(0~250ms)
attempt 3: 2000ms + jitter(0~500ms)
attempt 4: 4000ms + jitter(0~1000ms)
attempt 5: 8000ms + jitter(0~2000ms)
attempt 6: 16000ms + jitter(0~4000ms)
attempt 7+: 32000ms + jitter(0~8000ms)  ← 上限
```

#### 7.3 529 的特殊处理：前台 vs 后台

Claude Code 区分了"前台"和"后台"查询源：

```TypeScript
// 前台：用户在等待结果的查询
const FOREGROUND_529_RETRY_SOURCES = new Set([
  'repl_main_thread',
  'sdk',
  'agent:custom',
  'agent:default',
  'compact',
  'auto_mode',
  // ...
])
```

后台查询（如 `prompt_suggestion`、`session_memory`、`title_generation`）遇到 529 直接失败，不重试。原因是：在容量级联故障时，每次重试都会放大服务端压力（3-10 倍网关放大），而用户根本不会注意到这些后台任务失败。

#### 7.4 模型降级（FallbackTriggeredError）

连续 3 次 529 后，触发模型降级：

```TypeScript
连续 529 计数器 >= MAX_529_RETRIES (3)
    ↓
throw FallbackTriggeredError {
  originalModel: "claude-opus-4-...",
  fallbackModel: "claude-sonnet-4-..."
}
    ↓
claude.ts: catch → re-throw（不处理）
    ↓
query.ts: catch → 切换 model，重新调用 queryModelWithStreaming
```

注意：`FallbackTriggeredError` 必须穿透所有中间层，直到 `query.ts` 才处理。如果在 `claude.ts` 被吞掉，降级就变成了空操作。

#### 7.5 Fast Mode 的特殊退避逻辑

Fast Mode（快速模式）遇到 429/529 时，有两条路径：

```TypeScript
Fast Mode 遇到 429/529
    │
    ├─ retry-after < 20s（短等待）
    │   → 等待 retry-after，保持 fast mode 继续重试
    │   → 目的：保持 prompt cache key 不变（fast mode 影响 cache key）
    │
    └─ retry-after >= 20s 或未知（长等待）
        → 触发 fast mode cooldown（最少 10 分钟）
        → retryContext.fastMode = false
        → 用标准速度重试
        → 目的：避免长时间等待，用户体验优先
```

还有一种情况：API 返回 400 "Fast mode is not enabled"，说明该组织没有开通 fast mode，永久禁用：

```TypeScript
if (wasFastModeActive && isFastModeNotEnabledError(error)) {
  handleFastModeRejectedByAPI()  // 永久禁用，写入本地状态
  retryContext.fastMode = false
  continue
}
```

#### 7.6 Persistent Retry 模式

对于无人值守的长时间运行任务（`CLAUDE_CODE_UNATTENDED_RETRY=1`），withRetry 支持无限重试：

```TypeScript
const PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000   // 最大退避 5 分钟
const PERSISTENT_RESET_CAP_MS = 6 * 60 * 60 * 1000 // 最长等待 6 小时
const HEARTBEAT_INTERVAL_MS = 30_000               // 每 30 秒发一次心跳

// 长等待时分块 sleep，每 30 秒 yield 一次心跳消息
let remaining = delayMs
while (remaining > 0) {
  yield createSystemAPIErrorMessage(error, remaining, attempt, maxRetries)
  const chunk = Math.min(remaining, HEARTBEAT_INTERVAL_MS)
  await sleep(chunk, signal, { abortError })
  remaining -= chunk
}
// 钳制 attempt，防止 for 循环退出
if (attempt >= maxRetries) attempt = maxRetries
```

心跳消息的作用：防止宿主环境（如 CI 系统）因为长时间无输出而认为进程已死，强制终止它。

---

### 八、getAnthropicClient：多云适配层

`client.ts` 的 `getAnthropicClient` 函数是一个多云适配层，根据环境变量决定使用哪个 SDK：

```TypeScript
CLAUDE_CODE_USE_BEDROCK=1  → AnthropicBedrock（AWS）
CLAUDE_CODE_USE_FOUNDRY=1  → AnthropicFoundry（Azure）
CLAUDE_CODE_USE_VERTEX=1   → AnthropicVertex（GCP）
默认                        → Anthropic（直连 API）
```

每个 provider 都有自己的认证逻辑：

```TypeScript
AWS Bedrock:
  → refreshAndGetAwsCredentials()
  → 支持 AWS_BEARER_TOKEN_BEDROCK（API key 认证）
  → 支持 ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION（Haiku 用不同区域）

Azure Foundry:
  → ANTHROPIC_FOUNDRY_API_KEY（API key）
  → 或 DefaultAzureCredential（Azure AD）

GCP Vertex:
  → GoogleAuth（ADC / 服务账号 / 元数据服务器）
  → 支持 ANTHROPIC_VERTEX_PROJECT_ID 作为 fallback
  → 避免 12 秒元数据服务器超时

直连 API:
  → ANTHROPIC_API_KEY（API key）
  → 或 OAuth token（claude.ai 订阅用户）
```

#### 8.1 自定义 fetch 包装

`buildFetch` 函数在原始 `fetch` 外包了一层，注入 `x-client-request-id` header：

```TypeScript
function buildFetch(fetchOverride, source) {
  const inner = fetchOverride ?? globalThis.fetch
  return (input, init) => {
    const headers = new Headers(init?.headers)
    // 只对 first-party API 注入，避免第三方代理拒绝未知 header
    if (injectClientRequestId && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID())
    }
    logForDebugging(`[API REQUEST] ${pathname} source=${source}`)
    return inner(input, { ...init, headers })
  }
}
```

`x-client-request-id` 的作用：当请求超时时，服务端不会返回 `request-id`，但客户端生成的 ID 可以用于关联服务端日志，帮助排查问题。

---

### 九、Prompt Cache 的完整机制

#### 9.1 addCacheBreakpoints：单点标记策略

```TypeScript
// 只在最后一条消息上打 cache_control 标记
const markerIndex = skipCacheWrite
  ? messages.length - 2  // fire-and-forget fork：标记倒数第二条
  : messages.length - 1  // 正常：标记最后一条

const result = messages.map((msg, index) => {
  const addCache = index === markerIndex
  // ...
})
```

为什么只打一个标记？Anthropic 的 KV cache 服务器（Mycro）在每个 `cache_control` 位置保护其之前的 KV pages。如果打两个标记，倒数第二个位置的 KV pages 会被多保留一轮，浪费内存。

`skipCacheWrite` 的场景：fire-and-forget 的 fork 请求（如 speculation、side question）。这类请求不应该写入新的 cache entry，但可以读取已有的 cache。把标记移到倒数第二条，让 Mycro 识别为"已存在的 cache entry"，不创建新的。

#### 9.2 系统提示词的分层缓存

系统提示词被分成多个块，每块有不同的 cache scope：

```TypeScript
系统提示词结构：
┌─────────────────────────────────────────────────────┐
│ Block 1: 核心指令（工具定义、基础行为）               │
│ cache_control: { type: "ephemeral", ttl: "1h" }     │  ← 长期缓存
├─────────────────────────────────────────────────────┤
│ Block 2: 用户上下文（当前目录、git 状态）             │
│ cache_control: { type: "ephemeral", ttl: "5m" }     │  ← 短期缓存
├─────────────────────────────────────────────────────┤
│ Block 3: 动态内容（文件列表、最近修改）               │
│ 无 cache_control                                    │  ← 不缓存
└─────────────────────────────────────────────────────┘
```

这个分层策略的逻辑：工具定义和核心指令几乎不变，适合 1 小时缓存；用户上下文每次对话可能变化，用 5 分钟缓存；动态内容每次都不同，不缓存。

#### 9.3 Prompt Cache Break Detection：两阶段检测

`promptCacheBreakDetection.ts` 实现了一个精密的 cache break 检测系统，分两个阶段：

**Phase 1（请求前）**：`recordPromptState()` 记录当前状态快照，计算哈希值，与上次状态对比，记录 `pendingChanges`。

**Phase 2（响应后）**：`checkResponseForCacheBreak()` 检查 API 返回的 `cache_read_input_tokens`，如果比上次下降超过 5% 且绝对值超过 2000 tokens，就认为发生了 cache break，结合 `pendingChanges` 生成诊断报告。

```TypeScript
检测到 cache break
    ↓
pendingChanges 有内容？
    ├─ 是 → 列出变化原因（model changed, system prompt changed, tools changed...）
    └─ 否 → 检查时间间隔
              ├─ > 1 小时 → "possible 1h TTL expiry"
              ├─ > 5 分钟 → "possible 5min TTL expiry"
              └─ < 5 分钟 → "likely server-side (prompt unchanged, <5min gap)"
```

检测的状态字段非常全面，包括：系统提示词哈希、工具 schema 哈希、每个工具的独立哈希、beta headers 列表、fast mode 状态、effort 值、extra body params 哈希……任何一个变化都可能导致 cache break。

---

### 十、Beta Headers 的 Latch 机制

某些 beta header 一旦在会话中启用，就会被"锁定"（latched），后续所有请求都带上这个 header：

```TypeScript
// Fast mode header：一旦启用就锁定
if (fastModeHeaderLatched && !betasParams.includes(FAST_MODE_BETA_HEADER)) {
  betasParams.push(FAST_MODE_BETA_HEADER)
}

// AFK mode header：auto mode 首次激活时锁定
if (afkHeaderLatched && isAgenticQuery && !betasParams.includes(AFK_MODE_BETA_HEADER)) {
  betasParams.push(AFK_MODE_BETA_HEADER)
}

// Cache editing header：cached microcompact 启用时锁定
if (cacheEditingHeaderLatched && !betasParams.includes(cacheEditingBetaHeader)) {
  betasParams.push(cacheEditingBetaHeader)
}
```

为什么要 latch？因为 **beta headers 是 prompt cache key 的一部分**。如果 headers 在会话中途变化，cache key 就变了，之前积累的 cache 全部失效。Latch 机制保证了 headers 的会话级稳定性。

这也解释了为什么 fast mode 的 `speed` 参数（控制实际请求速度）和 `FAST_MODE_BETA_HEADER`（影响 cache key）是分开的：

```TypeScript
// speed 参数：动态，cooldown 时不发送（不影响 cache key）
if (isFastModeForRetry) {
  speed = 'fast'
}

// beta header：latched，一旦启用就一直发送（保持 cache key 稳定）
if (fastModeHeaderLatched && !betasParams.includes(FAST_MODE_BETA_HEADER)) {
  betasParams.push(FAST_MODE_BETA_HEADER)
}
```

---

### 十一、完整的请求参数组装流程

每次 API 调用，`paramsFromContext` 函数组装完整的请求参数：

```TypeScript
paramsFromContext(retryContext)
    │
    ├─ 1. 确定 max_tokens
    │      getMaxOutputTokensForModel(model)
    │      → 读取 CLAUDE_CODE_MAX_OUTPUT_TOKENS 环境变量
    │      → 如果 tengu_otk_slot_v1 feature flag 开启，上限 8k（slot 预留优化）
    │      → retryContext.maxTokensOverride（context overflow 时降低）
    │
    ├─ 2. 组装 beta headers
    │      → 基础 betas（extended-output, interleaved-thinking 等）
    │      → latch 的 betas（fast mode, AFK mode, cache editing）
    │      → 动态 betas（context management）
    │
    ├─ 3. 配置 thinking
    │      → adaptive thinking（claude-3-7-sonnet 支持）：budget 动态调整
    │      → 标准 thinking：固定 budget，min(maxOutputTokens-1, thinkingBudget)
    │
    ├─ 4. 组装消息列表
    │      addCacheBreakpoints(messages, enablePromptCaching, ...)
    │      → 单点 cache_control 标记
    │      → cached microcompact 的 cache_edits 块
    │      → tool_result 的 cache_reference
    │
    ├─ 5. 组装系统提示词
    │      buildSystemPromptBlocks(systemPrompt, enablePromptCaching)
    │      → 分块，每块独立 cache_control
    │
    ├─ 6. 其他参数
    │      → temperature（thinking 开启时不传，默认 1）
    │      → context_management（API 侧上下文管理）
    │      → speed（fast mode）
    │      → output_config.effort（effort 参数）
    │
    └─ 7. 返回完整参数对象
```

---

### 十二、可观测性：每个关键点都有记录

API 层的可观测性是内嵌的，不是事后加的。关键时间点都有 checkpoint：

```TypeScript
queryCheckpoint('query_client_creation_start')
  → 创建 Anthropic client
queryCheckpoint('query_client_creation_end')
  → 发送 HTTP 请求
queryCheckpoint('query_api_request_sent')
  → 收到响应头
queryCheckpoint('query_response_headers_received')
  → 收到第一个 chunk
queryCheckpoint('query_first_chunk_received')
```

这五个 checkpoint 精确测量了：client 创建耗时、网络 TTFB（首字节时间）、流式传输开始时间。配合 `logAPISuccessAndDuration` 的最终汇总，可以精确定位性能瓶颈在哪一段。

---

### 十三、给 mini-claude-code 的启示

专题04 的核心是「流式处理」和「可靠性」。复刻时最小可行的 API 层是：

```TypeScript
async function* streamFromAPI(messages, systemPrompt, tools) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  
  const stream = await client.beta.messages
    .stream({
      model: 'claude-opus-4-5',
      max_tokens: 8096,
      system: systemPrompt,
      messages,
      tools,
    })
  
  const contentBlocks = []
  
  for await (const part of stream) {
    switch (part.type) {
      case 'content_block_start':
        contentBlocks[part.index] = {
          ...part.content_block,
          // tool_use 的 input 初始化为空字符串，后续累积
          ...(part.content_block.type === 'tool_use' && { input: '' }),
          ...(part.content_block.type === 'text' && { text: '' }),
        }
        break
      case 'content_block_delta':
        if (part.delta.type === 'text_delta')
          contentBlocks[part.index].text += part.delta.text
        if (part.delta.type === 'input_json_delta')
          contentBlocks[part.index].input += part.delta.partial_json
        break
      case 'content_block_stop': {
        const block = contentBlocks[part.index]
        // tool_use 的 input 从字符串解析为对象
        if (block.type === 'tool_use')
          block.input = JSON.parse(block.input)
        yield { type: 'assistant_block', block }
        break
      }
      case 'message_delta':
        yield { type: 'stop', stop_reason: part.delta.stop_reason }
        break
    }
  }
}
```

这个骨架只有 40 行，但已经包含了 claude.ts 流式解析的核心逻辑：手动管理 `contentBlocks` 数组、在 `content_block_stop` 时 yield 完整块、避免 O(n²) 的 JSON 解析。

真实实现在这个骨架上叠加了：重试、降级、看门狗、prompt caching、beta headers、可观测性……每一层都是为了解决真实世界中遇到的具体问题。

---

*下一篇：专题03——上下文压缩系统，深入 Claude Code 如何在对话超长时自动压缩上下文，保持对话连贯性的完整实现细节。*
