# 0x16 Analytics & Feature Flags——Claude Code 的遥测神经网络-副本

> 系列：Claude Code 源码深度研究 · 专题 16
> 版本：v2.1.88 · 文件：`src/services/analytics/`

---

### 一、从一个悄悄发生的事件说起

你在终端输入 `claude`，按下回车。在你看到提示符的那一刻，Claude Code 已经悄悄向 Anthropic 发送了一个事件：`tengu_started`。你的每一次工具调用、每一次错误、每一次会话结束，都会触发类似的事件。

表面上看，这就是个埋点系统，记录一些使用数据——不就这样吗？

但真实的实现远比这复杂。遥测系统必须在程序启动的最早阶段就就绪，不能依赖任何业务模块；事件要在 sink 附加之前就开始排队，不能丢失；用户代码内容绝对不能出现在遥测数据里，类型系统要在编译期就强制这一点；Feature Flag 要能在不发版的情况下远程控制 Claude Code 的行为。

这篇文章要带你深入 `src/services/analytics/`，看清楚这套遥测神经网络的完整设计。

> 交叉引用：Analytics 系统在启动流程的 `initSinks()` 阶段初始化（→ 参见**专题 12**：启动流程），GrowthBook Feature Flag 控制 Hooks 系统的部分行为（→ 参见**专题 10**：Hooks 系统），`tengu_started` 事件是会话成功率的分母，与查询引擎的会话生命周期相关（→ 参见**专题 01**：查询引擎）。

`src/services/analytics/` 目录下共 9 个文件，合计约 4000 行，构成了 Claude Code 的"神经网络"：

| 文件 | 职责 |
| --- | --- |
| `config.ts` | 全局 analytics 开关（opt-out 判断） |
| `index.ts` | 公共 API，事件队列，零依赖入口 |
| `sink.ts` | 路由层，连接 index 与具体后端 |
| `sinkKillswitch.ts` | 单后端紧急熔断 |
| `datadog.ts` | Datadog 批量上报 |
| `firstPartyEventLogger.ts` | 1P OTel 事件日志 + 采样 |
| `firstPartyEventLoggingExporter.ts` | OTel Exporter，磁盘容灾 + 重试 |
| `metadata.ts` | 事件元数据富化（环境、进程、Agent 身份） |
| `growthbook.ts` | Feature Flag / A/B 实验，GrowthBook SDK 封装 |

本文将逐层拆解，重点关注**架构决策**、**容灾设计**和**隐私边界**。

---

### 二、零依赖入口：index.ts 的队列设计

#### 2.1 为什么要"零依赖"

`index.ts` 的文件头注释写得很直白：

```TypeScript
// 代码块
DESIGN: This module has NO dependencies to avoid import cycles.
Events are queued until attachAnalyticsSink() is called during app initialization.

```

Claude Code 的启动链很长：bootstrap → trust dialog → auth → GrowthBook init → analytics sink attach。如果 `index.ts` 依赖任何业务模块，就会产生循环引用。解决方案是把 `index.ts` 做成纯粹的"邮箱"——只收信，不知道收件人是谁，直到 `attachAnalyticsSink()` 被调用。

#### 2.2 事件队列的生命周期

```TypeScript
// 代码块
const eventQueue: QueuedEvent[] = []
let sink: AnalyticsSink | null = null

export function attachAnalyticsSink(newSink: AnalyticsSink): void {
  if (sink !== null) return  // 幂等
  sink = newSink

  if (eventQueue.length > 0) {
    const queuedEvents = [...eventQueue]
    eventQueue.length = 0
    queueMicrotask(() => {
      for (const event of queuedEvents) {
        if (event.async) void sink!.logEventAsync(event.eventName, event.metadata)
        else sink!.logEvent(event.eventName, event.metadata)
      }
    })
  }
}

```

几个细节值得注意：

**幂等性**：`if (sink !== null) return`。`attachAnalyticsSink` 可以从 `preAction` hook（子命令路径）和 `setup()`（默认命令路径）两处调用，幂等保证不会重复 attach。

**queueMicrotask 而非同步 drain**：drain 放在 microtask 里，避免在 `attachAnalyticsSink` 调用栈上同步执行大量事件处理，不阻塞启动路径。

**快照再清空**：`const queuedEvents = [...eventQueue]; eventQueue.length = 0`。先快照再清空，防止 drain 过程中新事件被漏掉。

#### 2.3 类型安全的隐私护栏

```TypeScript
// 代码块
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = never

```

这两个类型都是 `never`——它们永远不能持有值，只能用于类型转换（`as`）。这是一种**文档即约束**的设计：任何想把字符串传入 `logEvent` 的代码，必须显式写 `myStr as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`，这个 cast 在 code review 时会立刻引起注意。

`_PROTO_*` 前缀的字段走 PII-tagged 通道，只有 1P exporter 能看到原始值；Datadog 等通用后端在 `stripProtoFields()` 之后才能收到数据。

---

### 三、路由层：sink.ts 与 sinkKillswitch.ts

#### 3.1 sink.ts：两条路由

```TypeScript
// 代码块
function logEventImpl(eventName: string, metadata: LogEventMetadata): void {
  const sampleResult = shouldSampleEvent(eventName)
  if (sampleResult === 0) return  // 采样丢弃

  const metadataWithSampleRate = sampleResult !== null
    ? { ...metadata, sample_rate: sampleResult }
    : metadata

  if (shouldTrackDatadog()) {
    // Datadog 是通用访问后端，strip _PROTO_* 字段
    void trackDatadogEvent(eventName, stripProtoFields(metadataWithSampleRate))
  }
  // 1P 收到完整 payload，exporter 内部处理 PII 字段
  logEventTo1P(eventName, metadataWithSampleRate)
}

```

这里有一个重要的**安全不变量**：`_PROTO_*` 字段永远不会出现在 Datadog 里，因为 `stripProtoFields` 在 Datadog 调用之前执行，且这是唯一的调用路径。

#### 3.2 sinkKillswitch.ts：混淆名称的紧急熔断

```TypeScript
// 代码块
const SINK_KILLSWITCH_CONFIG_NAME = 'tengu_frond_boric'  // 故意混淆的名称

export function isSinkKilled(sink: SinkName): boolean {
  const config = getDynamicConfig_CACHED_MAY_BE_STALE<
    Partial<Record<SinkName, boolean>>
  >(SINK_KILLSWITCH_CONFIG_NAME, {})
  return config?.[sink] === true
}

```

`tengu_frond_boric` 是一个故意混淆的 GrowthBook config 名称（注释写着 "Mangled name"）。如果某个后端出现问题，可以通过 GrowthBook 远程下发 `{ "datadog": true }` 来立即停止对应后端的数据上报，无需发布新版本。

注意 fail-open 语义：`config?.[sink] === true`，只有明确为 `true` 才 kill，`undefined`/`false`/`null` 都不 kill。宁可多发数据，也不因配置缺失而误 kill。

---

### 四、Datadog 后端：批量、基数控制与用户桶

#### 4.1 批量上报架构

```TypeScript
// 代码块
const DEFAULT_FLUSH_INTERVAL_MS = 15000
const MAX_BATCH_SIZE = 100

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushLogs()
  }, getFlushIntervalMs()).unref()  // .unref() 不阻止进程退出
}

```

`.unref()` 意味着如果进程在 15 秒内退出，最后一批日志可能丢失。为此，`shutdownDatadog()` 在 `gracefulShutdown()` 中被显式调用，确保退出前 flush。

#### 4.2 基数控制：三层归一化

Datadog 的计费和告警都依赖 tag 基数，Claude Code 做了三层归一化：

**MCP 工具名**：`mcp__<server>__<tool>` 统一归一为 `'mcp'`，防止用户自定义 server 名导致基数爆炸。

**模型名**（外部用户）：归一化到 `MODEL_COSTS` 中的标准名，未知模型归为 `'other'`。

**版本号**：dev 版本 `2.0.53-dev.20251124.t173302.sha526cc6a` 截断为 `2.0.53-dev.20251124`，去掉时间戳和 commit hash。

#### 4.3 用户桶：隐私保护的近似计数

```TypeScript
// 代码块
const NUM_USER_BUCKETS = 30

const getUserBucket = memoize((): number => {
  const userId = getOrCreateUserID()
  const hash = createHash('sha256').update(userId).digest('hex')
  return parseInt(hash.slice(0, 8), 16) % NUM_USER_BUCKETS
})

```

不直接上报 userId（隐私），通过 SHA256 哈希取模分配到 30 个桶。可以用"有多少个不同的桶被触发"来近似估计受影响的用户数——30 个桶意味着每个桶约代表 3.3% 的用户，精度足够用于告警判断（"这个错误影响了 10 个桶 ≈ 33% 的用户"）。

#### 4.4 DATADOG_ALLOWED_EVENTS 白名单

Datadog 只接受预定义的 44 个事件名，其他事件即使通过了 gate 检查也会被过滤掉。这是一个**显式白名单**设计，防止开发者随意添加新事件到 Datadog 而不经过审查。

---

### 五、1P 事件日志：OpenTelemetry + 磁盘容灾

#### 5.1 为什么用 OpenTelemetry

`firstPartyEventLogger.ts` 使用 `@opentelemetry/sdk-logs` 的 `LoggerProvider` + `BatchLogRecordProcessor`。选择 OTel 的原因：标准化的批处理、背压、flush 语义，以及三个参数（`scheduledDelayMillis`、`maxExportBatchSize`、`maxQueueSize`）全部通过 GrowthBook 动态配置（`tengu_1p_event_batch_config`）。

与客户 OTLP 遥测完全隔离——不注册到全局 provider，从本地 `firstPartyEventLoggerProvider.getLogger()` 获取 logger，而非 `logs.getLogger()`（全局 API）。注释特别强调：两者绝对不能混用。

#### 5.2 动态重建：onGrowthBookRefresh 联动

当 GrowthBook 刷新后，`tengu_1p_event_batch_config` 可能发生变化（比如调整批次大小或切换 endpoint）。`reinitialize1PEventLoggingIfConfigChanged` 处理这个场景，采用"先 null 再 flush 再 swap"的顺序：

1. 先将 `firstPartyEventLogger` 置 null，阻断新事件写入旧 provider（swap 窗口期间丢弃少量事件，但防止写入正在 drain 的 provider）
2. `forceFlush()` 强制 flush 旧 buffer（失败的事件落磁盘，新 exporter 会重试）
3. 创建新 provider
4. 失败则恢复旧 provider，等下次 GrowthBook 刷新重试
5. 后台关闭旧 provider

这个顺序确保了 swap 窗口期间没有事件丢失，且失败时系统能继续工作。

#### 5.3 FirstPartyEventLoggingExporter：磁盘容灾

`firstPartyEventLoggingExporter.ts`（807 行）实现了多层容灾：

**磁盘容灾**：export 失败时，事件以 JSONL 格式追加写入 `~/.claude/telemetry/1p_failed_events.<BATCH_UUID>.<sessionId>.jsonl`。文件名包含进程级唯一 ID 和 sessionId，确保多进程并发写入不冲突（append-only，天然并发安全）。

**二次方退避重试**：`attempts=n` 时 delay = `baseBackoff * n^2`，超过 `maxAttempts` 后丢弃。

**健康时立即重试**：任何一次 export 成功后，立即触发磁盘上失败事件的重试（endpoint 健康时不等退避）。

**Auth 降级**：收到 401 时，尝试不带 auth header 重试。

**大批次分片**：超过 `maxBatchSize` 的批次自动分片，避免单次请求过大。

---

### 六、GrowthBook：Feature Flag 的完整生命周期

#### 6.1 整体架构

GrowthBook 是 Claude Code 的 Feature Flag 和 A/B 实验平台。`growthbook.ts` 是一个 1156 行的复杂封装，解决了 SDK 本身的若干问题。

用户属性（targeting 依据）包含：deviceId、sessionId、platform、organizationUUID、accountUUID、userType、subscriptionType、rateLimitTier、email、appVersion 等。

`apiBaseUrlHost` 是一个有趣的字段：企业代理部署（Epic、Marble 等）通常使用 `apiKeyHelper` 认证，没有 OAuth 账户信息，只能通过代理 hostname 来 targeting。

#### 6.2 remoteEval 模式与 SDK Bug 绕过

GrowthBook 客户端以 `remoteEval: true` 模式运行——特性值在服务端预计算，客户端只接收结果，不在本地重新评估规则。这对隐私更友好（用户属性不需要完整发送到服务端）。

但 SDK 存在两个 bug：

**Bug 1**：服务端返回 `{ "value": ... }`，SDK 期望 `{ "defaultValue": ... }`。`processRemoteEvalPayload` 做了字段转换。

**Bug 2**：即使转换后，SDK 的 `evalFeature()` 仍然会尝试在本地重新评估规则，忽略预计算的值。解决方案是维护独立的 `remoteEvalFeatureValues: Map<string, unknown>`，完全绕过 SDK 的求值逻辑：

```TypeScript
// 代码块
if (remoteEvalFeatureValues.has(feature)) {
  result = remoteEvalFeatureValues.get(feature) as T
} else {
  result = growthBookClient.getFeatureValue(feature, defaultValue) as T
}

```

#### 6.3 三级缓存与读取优先级

特性值的读取有四个来源，优先级从高到低：

1. **环境变量覆盖**（`CLAUDE_INTERNAL_FC_OVERRIDES`）：仅 `USER_TYPE=ant` 可用，用于 eval harness 测试特定配置
2. **Config 文件覆盖**（`growthBookOverrides`）：仅 ant 可用，通过 `/config Gates` 标签页设置，运行时可变
3. **内存缓存**（`remoteEvalFeatureValues`）：进程内最新值，`processRemoteEvalPayload` 后填充
4. **磁盘缓存**（`~/.claude.json` 的 `cachedGrowthBookFeatures`）：跨进程持久化，`syncRemoteEvalToDisk` 写入

`getFeatureValue_CACHED_MAY_BE_STALE` 是最常用的读取函数，同步返回，不阻塞启动路径。

#### 6.4 磁盘缓存的防毒设计

`processRemoteEvalPayload` 有一个关键的空载荷保护：

```TypeScript
// 代码块
if (!payload?.features || Object.keys(payload.features).length === 0) {
  return false
}

```

如果服务端返回 `{features: {}}`（空对象，可能是 bug 或截断响应），不检查长度会清空所有 flag 缓存，导致"total flag blackout"——所有进程共享 `~/.claude.json`，一次错误写入会影响所有实例。这个检查确保只有非空的有效 payload 才会更新缓存。

`syncRemoteEvalToDisk` 使用**全量替换**而非合并，确保服务端删除的 flag 不会在磁盘上留下"幽灵条目"。

#### 6.5 Auth 变化时的重初始化

GrowthBook 客户端创建后，`apiHostRequestHeaders` 无法更新。当用户登录/登出时，需要销毁并重建客户端：

```TypeScript
// 代码块
export function refreshGrowthBookAfterAuthChange(): void {
  resetGrowthBook()
  refreshed.emit()  // 通知订阅者回落到磁盘缓存

  reinitializingPromise = initializeGrowthBook()
    .catch(error => { logError(toError(error)); return null })
    .finally(() => { reinitializingPromise = null })
}

```

`reinitializingPromise` 的作用：安全门检查（`checkSecurityRestrictionGate`）会 `await reinitializingPromise`，确保在重初始化完成前不返回可能过期的安全相关 flag 值。

#### 6.6 四种 gate 读取函数的语义差异

| 函数 | 阻塞 | 用途 |
| --- | --- | --- |
| `getFeatureValue_CACHED_MAY_BE_STALE` | 否 | 热路径，启动关键路径 |
| `getFeatureValue_DEPRECATED` | 是（await init） | 已废弃，历史遗留 |
| `checkSecurityRestrictionGate` | 条件（await reinit） | 安全相关 gate，等待重初始化 |
| `checkGate_CACHED_OR_BLOCKING` | 条件（disk=false 时 await） | 用户触发功能，disk=true 快速返回 |

`checkGate_CACHED_OR_BLOCKING` 的设计哲学：stale `true` 可接受（服务端是真正的守门人），stale `false` 不可接受（会错误地阻止有权限的用户）。所以 disk=true 直接返回，disk=false 才阻塞等待新鲜值。

#### 6.7 实验曝光日志

当用户访问一个处于 A/B 实验中的 feature 时，需要记录"曝光"（exposure）——这个用户被分配到了哪个变体。

```TypeScript
// 代码块
const experimentDataByFeature = new Map<string, StoredExperimentData>()
const loggedExposures = new Set<string>()  // 会话内去重

function logExposureForFeature(feature: string): void {
  if (loggedExposures.has(feature)) return  // 去重
  const expData = experimentDataByFeature.get(feature)
  if (expData) {
    loggedExposures.add(feature)
    logGrowthBookExperimentTo1P({ experimentId: expData.experimentId, variationId: expData.variationId, ... })
  }
}

```

`pendingExposures` 处理了一个竞态：`getFeatureValue_CACHED_MAY_BE_STALE` 可能在 GrowthBook init 完成之前被调用（此时 `experimentDataByFeature` 还是空的）。这些"待记录"的曝光被放入 `pendingExposures`，等 init 完成后统一处理。

#### 6.8 周期性刷新

```TypeScript
// 代码块
const GROWTHBOOK_REFRESH_INTERVAL_MS =
  process.env.USER_TYPE !== 'ant'
    ? 6 * 60 * 60 * 1000  // 外部用户：6 小时
    : 20 * 60 * 1000       // ant：20 分钟

```

外部用户 6 小时刷新一次（与 Statsig 保持一致），ant 用户 20 分钟刷新一次（方便快速验证配置变更）。刷新使用"轻量刷新"（`refreshGrowthBookFeatures`），只重新拉取特性值，不销毁重建客户端。

---

### 七、元数据富化：metadata.ts 的信息密度

#### 7.1 环境上下文（memoized）

`buildEnvContext` 是 memoized 的——整个进程生命周期只构建一次，并发调用 `getPackageManagers()`、`getRuntimes()`、`getLinuxDistroInfo()`、`detectVcs()`。

但有一个例外：`kairosActive`（KAIROS 助手模式）不能 memoize，因为 `setKairosActive()` 在 `main.tsx` 的 ~1648 行才执行，可能晚于第一个事件的触发。所以 `kairosActive` 在 `getEventMetadata` 中每次都重新读取。

#### 7.2 进程指标

每个事件都附带进程内存和 CPU 使用情况。CPU 使用率是增量计算的（相对于上次 `buildProcessMetrics` 调用），而非绝对值。这对于检测"某个操作导致 CPU 飙升"很有用。

#### 7.3 Agent 身份识别

Claude Code 支持多种 Agent 模式（swarm 团队、subagent、standalone），`getAgentIdentification` 按优先级识别：

1. **AsyncLocalStorage**（同进程内的 subagent）
2. **环境变量**（跨进程的 swarm teammate）
3. **bootstrap state**（plan mode -> implementation 的父会话）

这三层识别覆盖了所有 Agent 运行模式，确保 BQ 中的事件可以正确归因到具体的 Agent 实例和团队。

#### 7.4 MCP 工具名的 PII 处理

MCP 工具名（`mcp__<server>__<tool>`）可能暴露用户的私有服务器配置，属于 PII-medium。默认归一化为 `'mcp_tool'`。但有三种例外情况可以记录原始名称：

1. `CLAUDE_CODE_ENTRYPOINT === 'local-agent'`（Cowork 模式，无 ZDR 概念）
2. `mcpServerType === 'claudeai-proxy'`（[claude.ai](http://claude.ai) 代理的官方 connector）
3. 服务器 URL 匹配官方 MCP 注册表（通过 `claude mcp add` 添加的目录 connector）

---

### 八、采样系统：动态控制事件量

```TypeScript
// 代码块
export function shouldSampleEvent(eventName: string): number | null {
  const config = getEventSamplingConfig()
  const eventConfig = config[eventName]

  if (!eventConfig) return null   // 无配置 = 100% 采样，不附加 sample_rate
  if (sampleRate >= 1) return null // 100% = 不需要记录 sample_rate
  if (sampleRate <= 0) return 0   // 0% = 丢弃

  return Math.random() < sampleRate ? sampleRate : 0
}

```

返回值语义：`null` 表示记录但不附加 `sample_rate`；正数表示记录且附加 `sample_rate`（用于下游加权统计）；`0` 表示丢弃。

通过 GrowthBook 动态调整任意事件的采样率，无需发布新版本。例如，某个高频事件可以设置 `sample_rate: 0.1` 来减少 90% 的数据量。

---

### 九、隐私边界总结

Claude Code 的 analytics 系统在多个层面建立了隐私边界：

**数据分级**：普通元数据（model、platform、version 等）所有后端可见；MCP 工具名默认归一化；`_PROTO_*` 字段（PII-tagged）仅 1P exporter 可见；代码内容、文件路径通过类型系统强制要求显式 cast。

**opt-out 机制**：第三方云提供商（Bedrock/Vertex/Foundry）自动禁用 analytics，因为这些部署场景下数据不应该回流到 Anthropic。

**企业代理识别**：`apiBaseUrlHost` 字段让 GrowthBook 能够识别企业代理部署，即使没有 OAuth 账户信息也能进行 targeting。

---

### 十、架构启示

Claude Code 的 analytics 系统展示了几个值得借鉴的工程实践：

**零依赖入口 + 队列缓冲**：解决了循环依赖和启动时序问题，任何时刻调用 `logEvent` 都是安全的。

**类型系统作为隐私护栏**：`never` 类型的 marker type 强制开发者在 code review 时审查每一个字符串字段的隐私属性。

**多层缓存 + 全量替换**：GrowthBook 的三级缓存确保了启动速度和数据新鲜度的平衡；全量替换避免了幽灵条目。

**fail-open vs fail-closed 的明确选择**：kill switch 是 fail-open（宁可多发数据），安全 gate 是 fail-closed（宁可阻止访问）。两种选择都有明确的业务理由。

**磁盘容灾 + 健康时立即重试**：1P exporter 的磁盘容灾确保网络抖动不会丢失事件；健康时立即重试确保恢复后积压事件能快速清空。

**基数控制的系统性思考**：从工具名、模型名到版本号，每个可能导致基数爆炸的字段都有对应的归一化策略。

---

### 十一、给 mini-claude-code 的启示

mini-claude-code 目前没有遥测系统，但可以借鉴 Claude Code 的核心设计思路来构建一个轻量级的可观测性层：

```Python
// 代码块
# mini-claude-code 的极简事件系统
# 对应 Claude Code 的 analytics/index.ts（零依赖入口 + 队列设计）

from typing import Any, Callable, Optional
from collections import deque

# 事件队列（在 sink 附加之前缓冲事件）
_event_queue: deque = deque()
_sink: Optional[Callable] = None

def log_event(event_name: str, metadata: dict[str, Any] = {}) -> None:
    """
    记录一个事件。如果 sink 未附加，事件进入队列等待。
    对应 Claude Code 的 logEvent()。
    """
    event = {"event": event_name, "metadata": metadata}
    if _sink is None:
        _event_queue.append(event)
    else:
        _sink(event)

def attach_sink(sink: Callable) -> None:
    """
    附加事件 sink，并 drain 队列中的积压事件。
    对应 Claude Code 的 attachAnalyticsSink()。
    幂等：多次调用只有第一次生效。
    """
    global _sink
    if _sink is not None:
        return  # 幂等
    _sink = sink
    # Drain 队列
    while _event_queue:
        event = _event_queue.popleft()
        sink(event)

# 使用示例：
# 在程序启动时（配置加载前）就可以调用 log_event
log_event("session_start", {"version": "0.1.0"})

# 配置加载完成后，附加实际的 sink
def file_sink(event):
    import json
    with open(".claude/events.jsonl", "a") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

attach_sink(file_sink)
# 此时 session_start 事件会被立即写入文件

```

**最值得从 Claude Code 借鉴的两个设计**：

第一，**零依赖入口 + 队列缓冲**。`log_event` 函数不应该依赖任何业务模块，这样可以在程序启动的最早阶段就开始记录事件，而不需要等待所有模块初始化完成。队列缓冲确保了在 sink 附加之前的事件不会丢失。

第二，**类型系统作为隐私护栏**。在 mini-claude-code 中，任何包含用户代码内容或文件路径的字段都应该有明确的标记（例如通过命名约定 `_VERIFIED_NOT_PII`），强制开发者在添加新字段时思考隐私问题。这比事后审查更有效。

---
