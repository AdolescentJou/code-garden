# 0x7 Bridge——让手机控制你电脑上的代码-副本

> *系列：Claude Code 源码深度研究 · 专题 07 *
> *版本：v2.1.88 · 文件：*`*src/bridge/*`

---

### 一、从一次远程操作说起

你打开手机上的 [claude.ai](http://claude.ai)，发了一条消息：「帮我把这个函数重构一下」。几秒后，你电脑上的代码文件被修改了。

表面上看，手机发消息，电脑执行——不就是个远程控制吗？

但真实的实现远比这复杂。手机和电脑之间没有直连，消息要经过 Anthropic 的云端中转；本地 CLI 要主动建立长连接轮询指令；网络断了要自动重连；多个会话要隔离，不能互相干扰。Claude Code 为此构建了一套完整的 Bridge 系统，15,000 行代码支撑着网页端和移动端对本地 CLI 的远程驱动能力。

这篇文章要带你深入 `src/bridge/`，看清楚每一条远程指令从云端到本地的完整旅程。

#### 1.1 什么是 Bridge？

Bridge（桥接）系统让用户可以在 [claude.ai](http://claude.ai) 网页或手机 App 上发送消息，由本地运行的 Claude Code CLI 来执行——本地文件系统、终端、Git 仓库全部可用，而交互界面却在云端。

这个能力在代码中被称为 **Remote Control**（远程控制），对应的用户入口是 `claude remote-control` 命令和 REPL 内的 `/remote-control` 斜杠命令。

> Bridge 系统建立在查询引擎之上，通过注入消息到 `queryLoop` 来驱动本地 Agent（→ 参见**专题 01**：查询引擎与对话循环）；多 Session 模式使用 Git Worktree 隔离，与多 Agent 系统的 Worktree 隔离机制相同（→ 参见**专题 09**：多 Agent 系统）。

#### 1.2 核心文件地图

```TypeScript
// 代码块
src/bridge/
├── bridgeMain.ts          # 独立 bridge 进程主循环（3000 行）
├── replBridge.ts          # REPL 内嵌 bridge 核心（2407 行）
├── bridgeApi.ts           # REST API 客户端（540 行）
├── bridgeMessaging.ts     # 消息路由与控制请求处理（462 行）
├── replBridgeTransport.ts # v1/v2 传输层抽象（371 行）
├── sessionRunner.ts       # 子进程 Session 管理（551 行）
├── workSecret.ts          # Work Secret 解码与 URL 构建（128 行）
├── bridgeConfig.ts        # 配置解析与 OAuth token 获取
├── bridgePointer.ts       # 崩溃恢复指针（文件持久化）
├── bridgeUI.ts            # 终端状态显示
├── capacityWake.ts        # 容量唤醒信号
├── flushGate.ts           # 初始消息刷新门控
├── jwtUtils.ts            # JWT 过期前主动刷新调度
├── pollConfig.ts          # GrowthBook 驱动的轮询配置
├── sessionIdCompat.ts     # session_* <-> cse_* ID 转换
└── trustedDevice.ts       # 可信设备 Token

```

#### 1.3 两种运行模式

Bridge 系统有两种截然不同的运行模式，共享大部分底层逻辑：

**独立模式（Standalone Bridge）**：`claude remote-control` 命令启动，由 `bridgeMain.ts` 驱动。支持多 Session 并发（最多 32 个），每个 Session 是一个独立的子进程。适合 CI/CD 场景或需要并行处理多个任务的场景。

**REPL 内嵌模式（REPL Bridge）**：在已有的 REPL 会话中执行 `/remote-control`，由 `replBridge.ts` 驱动。单 Session，与当前 REPL 进程共享上下文。用户在 [claude.ai](http://claude.ai) 上发的消息直接注入当前 REPL 的消息流。

---

### 二、核心架构：Environment + Work Queue

#### 2.1 三层抽象

Bridge 系统在服务端建立了三层抽象：

```TypeScript
// 代码块
Environment（环境）
  └── Session（会话）
        └── Work Item（工作项）

```

**Environment** 代表一台机器上的一个工作目录。注册时携带机器名、目录路径、Git 分支、最大 Session 数等元数据。服务端返回 `environment_id` 和 `environment_secret`，后者用于轮询工作队列（不需要 OAuth token，降低了轮询的认证开销）。

**Session** 是用户在 [claude.ai](http://claude.ai) 上看到的一个对话。每个 Session 绑定到一个 Environment，有独立的消息历史。Session ID 有两种形式：`session_*`（v1 compat 层）和 `cse_*`（v2 基础设施层），底层 UUID 相同。

**Work Item** 是服务端分发给 Bridge 的一个任务单元。当用户在 [claude.ai](http://claude.ai) 发送消息时，服务端将其封装为 Work Item 放入 Redis Stream（XAUTOCLAIM 机制），Bridge 通过轮询获取。Work Item 包含一个 **Work Secret**——base64url 编码的 JSON，携带 Session Ingress JWT 和 API base URL。

#### 2.2 Work Secret 解码

```TypeScript
// 代码块
// workSecret.ts
export function decodeWorkSecret(secret: string): WorkSecret {
  const json = Buffer.from(secret, 'base64url').toString('utf-8')
  const parsed = jsonParse(json)
  // 验证 version === 1
  // 验证 session_ingress_token 非空
  // 验证 api_base_url 存在
  return parsed as WorkSecret
}

```

Work Secret 的核心字段：

- `session_ingress_token`：JWT，用于 WebSocket 认证和心跳
- `api_base_url`：Session Ingress 服务地址
- `use_code_sessions`：布尔值，决定使用 v1 还是 v2 传输协议

#### 2.3 轮询循环

Bridge 的核心是一个 `while (!signal.aborted)` 轮询循环，调用 `GET /v1/environments/{id}/work/poll`：

```TypeScript
// 代码块
// bridgeApi.ts - pollForWork
const response = await axios.get(
  `${deps.baseUrl}/v1/environments/${environmentId}/work/poll`,
  {
    headers: getHeaders(environmentSecret),  // 用 environment_secret，不用 OAuth
    params: { reclaim_older_than_ms },       // XAUTOCLAIM 重新认领超时
    timeout: 10_000,
    signal,
  }
)

```

轮询返回 `null` 表示队列为空，返回 `WorkResponse` 表示有新任务。轮询间隔由 GrowthBook 特性标志 `tengu_bridge_poll_interval_config` 动态控制，支持以下场景的差异化配置：

- 空闲时（无活跃 Session）：`multisession_poll_interval_ms_not_at_capacity`
- 部分占用时：`multisession_poll_interval_ms_partial_capacity`
- 满载时：`multisession_poll_interval_ms_at_capacity`（可配置为 0 禁用轮询，改用心跳）

---

### 三、传输层：v1 与 v2 双轨并行

#### 3.1 v1：Session-Ingress WebSocket

v1 传输使用 `HybridTransport`——WebSocket 读取 + HTTP POST 写入的混合模式：

```TypeScript
// 代码块
claude.ai --SSE/WS--> Session-Ingress --WS--> Claude Code CLI
claude.ai <--POST---- Session-Ingress <--POST-- Claude Code CLI

```

WebSocket URL 构建：

```TypeScript
// 代码块
// workSecret.ts
export function buildSdkUrl(apiBaseUrl: string, sessionId: string): string {
  const isLocalhost = apiBaseUrl.includes('localhost')
  const protocol = isLocalhost ? 'ws' : 'wss'
  const version = isLocalhost ? 'v2' : 'v1'  // Envoy 在生产环境重写 /v1/ -> /v2/
  const host = apiBaseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `${protocol}://${host}/${version}/session_ingress/ws/${sessionId}`
}

```

v1 的认证使用 **OAuth token**（而非 JWT），因为 OAuth 有标准刷新流程，不需要额外的 JWT 刷新调度器。

#### 3.2 v2：CCR（Code Compute Runtime）

v2 传输使用 `SSETransport`（读）+ `CCRClient`（写）：

```TypeScript
// 代码块
claude.ai --SSE--> CCR /v1/code/sessions/{id}/events --> Claude Code CLI
claude.ai <--POST-- CCR /v1/code/sessions/{id}/worker/* <-- Claude Code CLI

```

v2 的认证**必须使用 JWT**（Work Secret 中的 `session_ingress_token`），因为 CCR 的 `register_worker.go:32` 会验证 JWT 中的 `session_id` claim，OAuth token 不携带这个字段。

v2 引入了 **SSE 序列号**机制：每个 SSE 事件有单调递增的序列号，transport 切换时携带 `from_sequence_num`，服务端从断点续传，避免重放整个历史。

#### 3.3 传输层抽象接口

`ReplBridgeTransport` 接口统一了 v1/v2 的差异：

```TypeScript
// 代码块
export type ReplBridgeTransport = {
  write(message: StdoutMessage): Promise<void>
  writeBatch(messages: StdoutMessage[]): Promise<void>
  close(): void
  isConnectedStatus(): boolean
  getStateLabel(): string
  setOnData(callback: (data: string) => void): void
  setOnClose(callback: (closeCode?: number) => void): void
  setOnConnect(callback: () => void): void
  connect(): void
  getLastSequenceNum(): number  // v1 始终返回 0
  readonly droppedBatchCount: number
  reportState(state: SessionState): void    // v2 专用
  reportMetadata(metadata: Record<string, unknown>): void  // v2 专用
  reportDelivery(eventId: string, status: 'processing' | 'processed'): void  // v2 专用
  flush(): Promise<void>
}

```

v1 的 `getLastSequenceNum()` 始终返回 0，因为 Session-Ingress 使用服务端游标而非客户端序列号。

---

### 四、消息流：从 [claude.ai](http://claude.ai) 到本地 REPL

#### 4.1 入站消息路由

所有入站消息经过 `handleIngressMessage`（`bridgeMessaging.ts`）统一路由：

```TypeScript
// 代码块
export function handleIngressMessage(
  data: string,
  recentPostedUUIDs: BoundedUUIDSet,   // 去重：过滤自己发出的消息回声
  recentInboundUUIDs: BoundedUUIDSet,  // 去重：过滤重复投递
  onInboundMessage,
  onPermissionResponse,
  onControlRequest,
): void {
  const parsed = normalizeControlMessageKeys(jsonParse(data))

  if (isSDKControlResponse(parsed)) { onPermissionResponse?.(parsed); return }
  if (isSDKControlRequest(parsed))  { onControlRequest?.(parsed); return }
  if (!isSDKMessage(parsed)) return

  // UUID 去重
  if (uuid && recentPostedUUIDs.has(uuid)) return  // 回声过滤
  if (uuid && recentInboundUUIDs.has(uuid)) return  // 重复投递过滤

  if (parsed.type === 'user') {
    recentInboundUUIDs.add(uuid)
    void onInboundMessage?.(parsed)  // 注入 REPL 消息流
  }
}

```

消息类型分三类：

- `control_response`：服务端对权限请求的响应（用户在 [claude.ai](http://claude.ai) 点击允许/拒绝）
- `control_request`：服务端发起的控制请求（initialize、set_model、interrupt 等）
- `SDKMessage`：用户消息（type=user）或助手消息（type=assistant）

#### 4.2 服务端控制请求处理

服务端会主动发送 `control_request`，Bridge 必须在 10-14 秒内响应，否则服务端会断开 WebSocket：

```TypeScript
// 代码块
switch (request.request.subtype) {
  case 'initialize':
    // 返回 CLI 能力声明（commands、models、output_style）
    response = { type: 'control_response', response: {
      subtype: 'success',
      response: { commands: [], output_style: 'normal', models: [], account: {} }
    }}
    break
  case 'interrupt':
    onInterrupt?.()  // 触发 SIGINT
    break
  case 'set_model':
    onSetModel?.(request.request.model)
    break
  case 'set_permission_mode':
    const result = onSetPermissionMode?.(request.request.mode)
    // 返回 ok 或 error
    break
}

```

#### 4.3 出站消息：初始刷新与增量写入

REPL Bridge 连接建立后，需要将当前 REPL 的历史消息同步给服务端（初始刷新），然后实时转发新消息（增量写入）。

**初始刷新**使用 `FlushGate` 门控机制：

```TypeScript
// 代码块
// 连接建立时
if (!initialFlushDone && initialMessages && initialMessages.length > 0) {
  initialFlushDone = true
  // 过滤：只发 user/assistant/local_command 类型
  const eligibleMessages = initialMessages.filter(isEligibleBridgeMessage)
  // 截断：最多发最近 N 条（GrowthBook 控制，默认 200）
  const cappedMessages = historyCap > 0 ? eligibleMessages.slice(-historyCap) : eligibleMessages
  // 批量发送
  await transport.writeBatch(sdkMessages)
  // 完成后：排空 FlushGate 中积压的新消息
  drainFlushGate()
  onStateChange?.('connected')
}

```

`FlushGate` 在初始刷新期间缓冲所有新消息，刷新完成后统一排空，保证历史消息和新消息的顺序性。

**增量写入**通过 `writeMessages()` 方法：每当 REPL 产生新消息，Bridge 将其转换为 SDKMessage 格式，通过 transport 发送。UUID 被记录到 `recentPostedUUIDs`，防止服务端回声被误认为新消息。

---

### 五、连接恢复：三层容错机制

Bridge 系统有精心设计的三层容错机制，应对各种网络和服务端故障。

#### 5.1 Transport 自动重连（第一层）

`HybridTransport`（v1）内置指数退避重连，最长重试 10 分钟。在此期间：

- WebSocket 读取中断，但 HTTP POST 写入继续（独立连接）
- 服务端通过游标记录已投递位置，重连后从断点续传

v2 的 `SSETransport` 同样有自动重连，携带 `from_sequence_num` 实现精确续传。

#### 5.2 Work Item 重新分发（第二层）

当 Transport 重连预算耗尽（10 分钟），触发 `handleTransportPermanentClose`：

```TypeScript
// 代码块
function handleTransportPermanentClose(closeCode: number | undefined): void {
  if (closeCode === 1000) {
    // 正常关闭 -> 会话结束，触发 teardown
    pollController.abort()
    triggerTeardown()
    return
  }
  // 异常关闭 -> 尝试环境重连
  void reconnectEnvironmentWithSession().then(success => {
    if (!success) triggerTeardown()
  })
}

```

`reconnectEnvironmentWithSession` 实现了两种策略：

**策略一：原地重连（Reconnect-in-place）**。调用 `POST /v1/environments/{id}/bridge/reconnect`，服务端强制停止旧 Worker 并重新入队 Session。如果服务端返回相同的 `environment_id`，说明环境仍然存活，直接复用——用户在 [claude.ai](http://claude.ai) 上的 URL 不变，历史消息不重发。

**策略二：新建 Session（Fresh session fallback）**。如果服务端返回不同的 `environment_id`（原环境 TTL 过期，通常是笔记本睡眠超过 4 小时），则归档旧 Session，在新环境上创建新 Session。

#### 5.3 心跳保活（第三层）

满载时（所有 Session 槽位占满），Bridge 停止轮询，改为心跳模式：

```TypeScript
// 代码块
// 心跳循环
while (!loopSignal.aborted && activeSessions.size >= config.maxSessions) {
  const hbResult = await heartbeatActiveWorkItems()
  if (hbResult === 'auth_failed' || hbResult === 'fatal') break
  await sleep(hbConfig.non_exclusive_heartbeat_interval_ms, cap.signal)
}

```

心跳调用 `POST /v1/environments/{id}/work/{workId}/heartbeat`，延续 Work Item 的 Redis 租约（默认 300 秒 TTL）。如果心跳返回 401/403（JWT 过期），触发 `reconnectSession` 重新分发，避免 Work Item 在 Redis PEL 中永久卡死（CC-1263 bug 的修复）。

---

### 六、崩溃恢复：Bridge Pointer

#### 6.1 指针文件机制

Bridge 在创建 Session 后立即写入一个"崩溃恢复指针"文件（`bridgePointer.ts`）：

```TypeScript
// 代码块
await writeBridgePointer(dir, {
  sessionId: currentSessionId,
  environmentId,
  source: 'repl',  // 或 'standalone'
})

```

指针文件存储在工作目录的某个固定路径，记录 `sessionId`、`environmentId` 和来源。如果进程被 `kill -9` 杀死，指针文件保留，下次启动时可以检测到并提示用户恢复。

正常退出时，指针文件被清除（`clearBridgePointer`）。

#### 6.2 Perpetual 模式

Daemon 模式（Agent SDK 调用）使用 `perpetual: true`，teardown 时**不清除**指针文件，也不调用 `stopWork`/`archiveSession`——让服务端的 Work Item 租约自然过期（300 秒），下次 Daemon 启动时通过 `reconnectSession` 重新激活。

```TypeScript
// 代码块
if (perpetual) {
  // 本地清理：停止轮询，释放 transport 引用
  transport = null
  flushGate.drop()
  // 刷新指针 mtime（防止 4h TTL 检查误判为过期）
  await writeBridgePointer(dir, { sessionId, environmentId, source: 'repl' })
  return  // 不发 result 消息，不调用 stopWork，不 deregister
}

```

#### 6.3 SSE 序列号持久化

Daemon 模式还会持久化 SSE 序列号（`getSSESequenceNum()`），下次启动时作为 `initialSSESequenceNum` 传入，避免重放整个 Session 历史：

```TypeScript
// 代码块
getSSESequenceNum() {
  // 合并：已关闭 transport 的高水位 + 当前 transport 的实时序列号
  const live = transport?.getLastSequenceNum() ?? 0
  return Math.max(lastTransportSequenceNum, live)
}

```

---

### 七、多 Session 管理（独立模式）

#### 7.1 Session 生命周期

独立模式（`bridgeMain.ts`）支持最多 32 个并发 Session，每个 Session 是一个独立的子进程：

```TypeScript
// 代码块
// sessionRunner.ts - spawn 子进程
const child = spawn(execPath, [
  ...scriptArgs,
  '--sdk-url', sdkUrl,
  '--session-id', sessionId,
  '--permission-mode', permissionMode,
  // ...
], { env, stdio: ['pipe', 'pipe', 'pipe'] })

```

子进程通过 stdout 输出 NDJSON 格式的消息流，`sessionRunner.ts` 解析这些消息提取活动状态（工具调用、文本输出、结果）用于终端状态显示。

#### 7.2 Session 超时看门狗

每个 Session 有可配置的超时时间（`DEFAULT_SESSION_TIMEOUT_MS`），超时后发送 SIGTERM，等待 grace period 后发送 SIGKILL：

```TypeScript
// 代码块
const timer = setTimeout(() => {
  timedOutSessions.add(sessionId)
  handle.kill()  // SIGTERM -> SIGKILL
}, sessionTimeoutMs)
sessionTimers.set(sessionId, timer)

```

超时的 Session 在 `onSessionDone` 中被标记为 `failed`（而非 `interrupted`），触发 `stopWork` 通知服务端。

#### 7.3 Git Worktree 隔离

多 Session 模式支持为每个 Session 创建独立的 Git Worktree，实现文件系统级隔离：

```TypeScript
// 代码块
const { worktreePath, worktreeBranch, gitRoot } = await createAgentWorktree(
  config.dir,
  safeFilenameId(sessionId),
)
sessionWorktrees.set(sessionId, { worktreePath, worktreeBranch, gitRoot })

```

Session 结束时自动清理 Worktree（`removeAgentWorktree`）。

---

### 八、JWT 刷新调度器

#### 8.1 主动刷新策略

Session Ingress JWT 有固定过期时间（约 5 小时）。Bridge 使用 `createTokenRefreshScheduler`（`jwtUtils.ts`）在过期前 5 分钟主动刷新：

```TypeScript
// 代码块
const tokenRefresh = createTokenRefreshScheduler({
  getAccessToken,
  onRefresh: (sessionId, oauthToken) => {
    if (v2Sessions.has(sessionId)) {
      // v2：调用 reconnectSession 触发服务端重新分发（携带新 JWT）
      void api.reconnectSession(environmentId, sessionId)
    } else {
      // v1：直接更新子进程的 OAuth token
      handle.updateAccessToken(oauthToken)
    }
  },
})

```

v1 和 v2 的刷新策略不同：v1 可以直接替换 OAuth token（WebSocket 重连时使用新 token）；v2 必须通过服务端重新分发（因为 JWT 中的 `session_id` claim 是服务端签发的，客户端无法自行生成）。

#### 8.2 CC-1263 修复

这个设计修复了一个严重 bug：v2 Daemon Session 在约 5 小时后会静默死亡——JWT 过期后，服务端不会自动重新分发 ACK 过的 Work Item，导致 Session 永久卡死。主动刷新调度器通过提前触发 `reconnectSession` 解决了这个问题。

---

### 九、安全设计

#### 9.1 ID 注入防护

所有服务端返回的 ID 在用于 URL 路径前都经过白名单验证：

```TypeScript
// 代码块
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export function validateBridgeId(id: string, label: string): string {
  if (!id || !SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}: contains unsafe characters`)
  }
  return id
}

```

防止路径遍历攻击（如 `../../admin`）。

#### 9.2 可信设备 Token

CCR v2 引入了 `SecurityTier=ELEVATED` 要求，`ConnectBridgeWorker` 需要可信设备 Token：

```TypeScript
// 代码块
const deviceToken = deps.getTrustedDeviceToken?.()
if (deviceToken) {
  headers['X-Trusted-Device-Token'] = deviceToken
}

```

由 `trustedDevice.ts` 管理，通过 GrowthBook 特性标志 `tengu_sessions_elevated_auth_enforcement` 控制是否强制执行。

#### 9.3 外向专用模式（Outbound-only）

Bridge 支持"只发不收"模式，此时所有可变控制请求（interrupt、set_model、set_permission_mode）都返回错误，防止远端意外修改本地 REPL 状态：

```TypeScript
// 代码块
if (outboundOnly && request.request.subtype !== 'initialize') {
  response = { type: 'control_response', response: {
    subtype: 'error',
    error: 'This session is outbound-only. Enable Remote Control locally to allow inbound control.'
  }}
}

```

---

### 十、调试与可观测性

#### 10.1 Ant 专用调试工具

内部员工（`USER_TYPE === 'ant'`）有额外的调试能力：

```TypeScript
// 代码块
// SIGUSR2 -> 强制触发 doReconnect()，无需等待 30 秒轮询
process.on('SIGUSR2', () => void reconnectEnvironmentWithSession())

// /bridge-kick 斜杠命令 -> 注入故障
registerBridgeDebugHandle({
  fireClose: code => debugFireClose?.(code),    // 模拟 WebSocket 关闭
  forceReconnect: () => void reconnectEnvironmentWithSession(),
  injectFault: injectBridgeFault,               // 注入 poll/register/heartbeat 失败
  wakePollLoop,
  describe: () => `env=${environmentId} session=${currentSessionId} ...`,
})

```

`wrapApiForFaultInjection`（`bridgeDebug.ts`）在 Ant 构建中拦截所有 API 调用，可以模拟各种故障场景。

#### 10.2 诊断日志

Bridge 使用两套日志系统：

- `logForDebugging`：详细调试日志，写入 `~/.claude/bridge-session-*.log`（仅 Ant 用户可见路径提示）
- `logForDiagnosticsNoPII`：无 PII 的诊断日志，上报到 Datadog

关键事件都有对应的 Analytics 埋点（`logEvent('tengu_bridge_*', ...)`），用于监控 Bridge 的健康状态。

#### 10.3 状态机

Bridge 对外暴露四个状态：

```TypeScript
// 代码块
type BridgeState = 'ready' | 'connected' | 'reconnecting' | 'failed'

```

- `ready`：环境已注册，等待 Work Item
- `connected`：Transport 已连接，初始消息已刷新
- `reconnecting`：Transport 断开，正在恢复
- `failed`：无法恢复（环境过期、认证失败、重连次数耗尽）

---

### 十一、完整数据流图

```TypeScript
// 代码块
用户在 claude.ai 发送消息
         |
         v
  服务端 Redis Stream
  (XAUTOCLAIM 机制)
         |
         v
  Bridge 轮询循环
  GET /v1/environments/{id}/work/poll
         |
         v
  解码 Work Secret
  (base64url -> JWT + API URL)
         |
         +--- v1 ---> HybridTransport
         |            (WSS 读 + HTTPS POST 写)
         |
         +--- v2 ---> SSETransport + CCRClient
                      (SSE 读 + HTTPS POST 写)
                      registerWorker -> epoch
         |
         v
  handleIngressMessage
  (去重 -> 路由)
         |
         +-- control_request -> handleServerControlRequest
         |   (initialize / interrupt / set_model / set_permission_mode)
         |
         +-- control_response -> onPermissionResponse
         |   (用户在 claude.ai 点击允许/拒绝)
         |
         +-- user message -> onInboundMessage
             (注入 REPL 消息流 / 子进程 stdin)

```

---

### 十二、设计哲学与工程亮点

#### 12.1 服务端权威原则

Bridge 的设计遵循"服务端是权威"原则：Work Item 的生命周期由服务端的 Redis TTL 控制，客户端只是消费者。这意味着即使客户端崩溃，服务端也会在 TTL 后重新分发 Work Item，保证消息不丢失。

#### 12.2 幂等性设计

所有关键操作都设计为幂等：

- `registerBridgeEnvironment` 携带 `reuseEnvironmentId`，服务端可以复用已有环境
- `archiveSession` 对 409（已归档）静默忽略
- `completedWorkIds` Set 防止重复处理已完成的 Work Item

#### 12.3 渐进式迁移

v1 和 v2 传输协议并行存在，由服务端的 Work Secret 中的 `use_code_sessions` 字段决定使用哪个。这种设计允许服务端按用户/环境逐步推进 v2 迁移，无需客户端版本强制升级。

#### 12.4 Bootstrap 隔离

`replBridge.ts` 的 `BridgeCoreParams` 通过依赖注入而非直接 import 获取所有外部依赖（`createSession`、`archiveSession`、`getAccessToken`、`toSDKMessages` 等）。这是为了防止 Agent SDK bundle 中引入整个 REPL 依赖树（`commands.ts`、`auth.ts`、`config.ts` 等约 1300 个模块）。

---

### 结语

Claude Code 的 Bridge 系统是一个工程复杂度极高的远程控制框架。它在以下几个维度上做出了精心的权衡：

**可靠性 vs 复杂度**：三层容错（Transport 自动重连 -> Work Item 重新分发 -> 心跳保活）确保了极高的可用性，代价是约 15,000 行的实现代码。

**性能 vs 一致性**：SSE 序列号机制避免了历史消息重放，但需要在 transport 切换时精确捕获高水位标记，任何遗漏都会导致消息丢失或重复。

**安全 vs 便利**：ID 白名单验证、可信设备 Token、外向专用模式等安全机制增加了实现复杂度，但防止了潜在的注入攻击和权限滥用。

这套系统的设计思路对于任何需要"云端控制本地进程"的场景都有参考价值——无论是远程开发环境、CI/CD 代理，还是 AI Agent 的人机协作界面。

---

### 十三、给 mini-claude-code 的启示

Bridge 系统对 mini-claude-code 的直接参考价值有限（mini-claude-code 是本地工具，不需要远程控制），但其中有两个设计思路值得借鉴：

**思路一：消息注入机制**。Bridge 通过向 `queryLoop` 注入消息来驱动 Agent，这与 mini-claude-code 的 `--print` 模式（非交互式单次执行）本质相同。如果要支持「从外部程序调用 mini-claude-code」，可以参考 Bridge 的消息注入设计：

```Python
// 代码块
# mini-claude-code 的非交互式调用模式
# 对应 Claude Code 的 Bridge 消息注入
async def run_once(prompt: str, tools: list) -> str:
    """非交互式执行一次任务，返回最终结果"""
    messages = [{"role": "user", "content": prompt}]
    async for event in query_loop(messages, tools):
        if event["type"] == "result":
            return event["content"]
    return ""

```

**思路二：幂等性设计**。Bridge 的所有关键操作都是幂等的（重复执行不会产生副作用）。mini-claude-code 的工具也应该尽量幂等：`FileWrite` 写入相同内容不应报错，`Bash` 执行 `mkdir -p` 而不是 `mkdir`。幂等性让工具在网络重试、用户中断后重新执行时更加健壮。

---

*下一篇：专题08——MCP 协议，深入 Claude Code 如何通过标准化协议接入外部工具服务器，以及五种连接状态背后的优雅降级设计。*
