# 0x8 MCP 协议——Claude Code 的插件系统-副本

> *系列：Claude Code 源码深度研究 · 专题 08 *
> *版本：v2.1.88 · 文件：*`*src/services/mcp/*`* · *`*src/tools/MCPTool/*`

---

### 一、从一个外部工具说起

你在配置文件里加了一个 MCP 服务器，重启 Claude Code，然后对它说：「用 Figma 工具帮我导出这个组件的设计稿。」它真的做到了——尽管 Claude Code 的源码里根本没有 Figma 相关的代码。

表面上看，MCP 就是个插件系统，配置一下就能用——不就这样吗？

但真实的实现远比这复杂。MCP 服务器可能连接失败、需要 OAuth 授权、工具描述可能超长、工具名可能和内置工具冲突。Claude Code 要管理每个服务器的连接状态、统一调度 MCP 工具和内置工具、在服务器挂掉时优雅降级而不影响整体运行。

这篇文章要带你深入 `src/services/mcp/`，看清楚每一个 MCP 工具从配置到调用的完整链路。

从架构上看，MCP 在 Claude Code 中扮演了「插件系统」的角色：

```TypeScript
// 代码块
Claude Code（MCP 客户端）
         |
         | JSON-RPC 2.0
         |
+--------+--------+--------+--------+
|        |        |        |        |
stdio   SSE     HTTP     WebSocket  ...
|        |        |        |
本地进程  远程服务  远程服务  远程服务
(最常用)

```

`src/services/mcp/client.ts` 是整个 MCP 子系统的核心，3349 行代码，处理连接建立、工具发现、工具调用、认证、重连等所有逻辑。

> MCP 工具在工具执行流水线中有专门的处理路径（→ 参见**专题 05**：工具系统）；MCP 服务器的权限控制遵循统一的权限系统（→ 参见**专题 06**：权限系统）；Skills 系统也可以通过 MCP 服务器提供（→ 参见**专题 11**：Skills 系统）。

---

### 二、传输协议：8 种连接方式

Claude Code 支持 8 种 MCP 传输协议，每种都有不同的适用场景：

```TypeScript
// 代码块
// src/services/mcp/types.ts
export const TransportSchema = z.enum([
  'stdio',     // 本地子进程（最常用）
  'sse',       // Server-Sent Events（远程，单向推送）
  'sse-ide',   // IDE 扩展专用 SSE（内部）
  'http',      // Streamable HTTP（新标准，双向）
  'ws',        // WebSocket（双向，低延迟）
  'ws-ide',    // IDE 扩展专用 WebSocket（内部）
  'sdk',       // SDK 内嵌（进程内）
  'claudeai-proxy', // Claude.ai 平台代理（内部）
])

```

#### 2.1 stdio：最常用的本地传输

```TypeScript
// 代码块
// 配置示例（~/.claude/settings.json）
{
  "mcpServers": {
    "my-tool": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": { "API_KEY": "xxx" }
    }
  }
}

```

stdio 传输通过标准输入/输出与子进程通信。Claude Code 启动子进程，通过 stdin 发送 JSON-RPC 请求，从 stdout 读取响应。这是最简单、最可靠的方式，适合本地工具。

#### 2.2 SSE vs HTTP：两代远程传输

SSE（Server-Sent Events）是旧标准，服务器通过长连接推送事件，客户端通过 POST 发送请求。HTTP（Streamable HTTP）是 MCP 2025-03-26 规范引入的新标准，支持双向流式通信。

关键区别：SSE 的 GET 连接是长连接（不能加超时），POST 请求需要超时保护。Claude Code 为此实现了 `wrapFetchWithTimeout`：

```TypeScript
// 代码块
export function wrapFetchWithTimeout(baseFetch: FetchLike): FetchLike {
  return async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // GET 请求是长连接 SSE 流，不加超时
    if (method === 'GET') {
      return baseFetch(url, init)
    }

    // POST 请求加 60 秒超时
    // 用 setTimeout 而不是 AbortSignal.timeout()，
    // 因为 Bun 的 AbortSignal.timeout() 有内存泄漏（每个请求 ~2.4KB 残留 60 秒）
    const controller = new AbortController()
    const timer = setTimeout(
      c => c.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      MCP_REQUEST_TIMEOUT_MS,  // 60 秒
      controller,
    )
    timer.unref?.()
    // ...
  }
}

```

#### 2.3 MCP Streamable HTTP 的 Accept 头问题

```TypeScript
// 代码块
// MCP Streamable HTTP 规范要求每个 POST 都携带这个 Accept 头
const MCP_STREAMABLE_HTTP_ACCEPT = 'application/json, text/event-stream'

// 在 wrapFetchWithTimeout 中强制添加
if (!headers.has('accept')) {
  headers.set('accept', MCP_STREAMABLE_HTTP_ACCEPT)
}

```

为什么要在这里强制添加？因为 MCP SDK 在 `StreamableHTTPClientTransport.send()` 内部设置了这个头，但经过 `object spread` 后某些运行时/代理会丢失它，导致服务器返回 HTTP 406。在最后一层 wrapper 里强制设置，确保它一定到达网络层。

---

### 三、连接管理：memoize + 五种状态

#### 3.1 connectToServer 的 memoize 设计

```TypeScript
// 代码块
export const connectToServer = memoize(
  async (name: string, serverRef: ScopedMcpServerConfig, ...): Promise<MCPServerConnection> => {
    // 建立连接...
  },
  (name, serverRef) => getServerCacheKey(name, serverRef),  // 缓存键
)

```

`connectToServer` 被 `memoize` 包裹，相同的 `(name, serverRef)` 组合只会建立一次连接。这防止了并发启动时多次连接同一服务器的问题。

**为什么需要 memoize？** Claude Code 在多个地方需要获取 MCP 连接：工具列表构建时、工具调用时、UI 状态显示时。如果没有 memoize，这些调用会各自建立独立连接，导致同一个 stdio 服务器被启动多次（每次都是独立子进程），资源浪费且行为不可预期。memoize 确保「同一服务器配置 = 同一连接对象」，是整个 MCP 子系统的基础不变量。

#### 3.2 五种连接状态

```TypeScript
// 代码块
type MCPServerConnection =
  | ConnectedMCPServer    // 已连接，有 client 和 capabilities
  | FailedMCPServer       // 连接失败，有 error 信息
  | NeedsAuthMCPServer    // 需要认证（OAuth 流程）
  | PendingMCPServer      // 连接中，有重连计数
  | DisabledMCPServer     // 用户手动禁用

```

状态转换：

```TypeScript
// 代码块
初始 -> Pending
Pending -> Connected（成功）
Pending -> Failed（失败）
Pending -> NeedsAuth（401/403）
Connected -> NeedsAuth（工具调用时 401）
任意 -> Disabled（用户禁用）
Disabled -> Pending（用户重新启用）

```

#### 3.3 批量连接控制

```TypeScript
// 代码块
// 本地服务器（stdio/sdk）：每批 3 个
export function getMcpServerConnectionBatchSize(): number {
  return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE || '', 10) || 3
}

// 远程服务器（sse/http/ws）：每批 20 个
function getRemoteMcpServerConnectionBatchSize(): number {
  return parseInt(process.env.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE || '', 10) || 20
}

```

本地服务器批量小（3个），因为每个都要启动子进程，并发太多会拖慢启动速度。远程服务器批量大（20个），因为网络请求可以高度并发。

---

### 四、工具命名：normalizeNameForMCP

MCP 工具名格式：`mcp__{serverName}__{toolName}`

```TypeScript
// 代码块
// src/services/mcp/normalization.ts
export function normalizeNameForMCP(name: string): string {
  // 将所有非法字符（包括点、空格）替换为下划线
  let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')

  // claude.ai 服务器名额外处理：合并连续下划线，去掉首尾下划线
  // 防止与 __ 分隔符冲突
  if (name.startsWith('claude.ai ')) {
    normalized = normalized.replace(/_+/g, '_').replace(/^_|_$/g, '')
  }
  return normalized
}

```

示例：

- `"my-server"` -> `mcp__my-server__tool_name`
- `"claude.ai Slack"` -> `mcp__claude_ai_Slack__send_message`
- `"my.server.v2"` -> `mcp__my_server_v2__tool_name`

为什么 [claude.ai](http://claude.ai) 服务器需要额外处理？因为 [claude.ai](http://claude.ai) 服务器名以 `"claude.ai "` 开头，包含点和空格，直接替换会产生 `claude_ai_Slack`，但如果名字更复杂（如 `"claude.ai  Slack"`，两个空格），会产生 `claude_ai__Slack`，其中的 `__` 会与工具名分隔符冲突。

---

### 五、工具发现与注册

#### 5.1 连接后自动发现工具

```TypeScript
// 代码块
// 连接成功后，立即列出服务器提供的所有工具
const toolsResult: ListToolsResult = await client.listTools()

// 将 MCP 工具转换为 Claude Code 的 Tool 接口
const tools = toolsResult.tools.map(toolDef => {
  const toolName = buildMcpToolName(serverName, toolDef.name)
  return new MCPTool({
    serverName,
    toolName,
    toolDef,
    client,
    // ...
  })
})

```

#### 5.2 工具描述截断

```TypeScript
// 代码块
// OpenAPI 生成的 MCP 服务器可能有 15-60KB 的工具描述
// 截断到 2048 字符，防止占用过多 token
const MAX_MCP_DESCRIPTION_LENGTH = 2048

const description = toolDef.description?.slice(0, MAX_MCP_DESCRIPTION_LENGTH) ?? ''

```

这个设计很务实：OpenAPI 规范允许非常详细的端点描述，但把 60KB 的描述发给模型既浪费 token，又可能超出上下文窗口。2048 字符足以传达工具的核心用途。

**为什么是 2048 而不是更大？** 这是一个经验值，来自对真实 MCP 服务器的观察。大多数工具描述在 500 字符以内就能说清楚用途；超过 2048 字符的描述通常是 OpenAPI 自动生成的冗余内容（参数类型说明、示例值、错误码列表），对模型的工具选择帮助有限，却会显著增加每次 API 调用的 token 消耗。如果一个 MCP 服务器有 50 个工具，每个描述 60KB，光工具列表就要消耗约 3M tokens——这是不可接受的。

#### 5.3 配置作用域

```TypeScript
// 代码块
type ConfigScope =
  | 'local'       // 本地（.claude/settings.local.json）
  | 'user'        // 用户（~/.claude/settings.json）
  | 'project'     // 项目（.claude/settings.json）
  | 'dynamic'     // 动态（运行时添加）
  | 'enterprise'  // 企业策略
  | 'claudeai'    // Claude.ai 平台
  | 'managed'     // 托管配置

```

不同作用域的服务器有不同的权限和优先级。企业策略（`enterprise`）的服务器配置不能被用户覆盖。

---

### 六、认证系统：OAuth 2.0 + 缓存

#### 6.1 needs-auth 缓存

```TypeScript
// 代码块
const MCP_AUTH_CACHE_TTL_MS = 15 * 60 * 1000  // 15 分钟

// 缓存文件：~/.claude/mcp-needs-auth-cache.json
// 格式：{ "server-name": { "timestamp": 1234567890 } }

async function isMcpAuthCached(serverId: string): Promise<boolean> {
  const cache = await getMcpAuthCache()
  const entry = cache[serverId]
  if (!entry) return false
  return Date.now() - entry.timestamp < MCP_AUTH_CACHE_TTL_MS
}

```

当服务器返回 401/403 时，Claude Code 会将其标记为 `needs-auth` 并缓存 15 分钟。这防止了每次启动都重复触发 OAuth 流程。

#### 6.2 [claude.ai](http://claude.ai) 代理的 OAuth 重试

```TypeScript
// 代码块
export function createClaudeAiProxyFetch(innerFetch: FetchLike): FetchLike {
  return async (url, init) => {
    const { response, sentToken } = await doRequest()

    if (response.status !== 401) return response

    // 401 时：检查 token 是否已更新（另一个连接可能已刷新）
    const tokenChanged = await handleOAuth401Error(sentToken).catch(() => false)

    if (!tokenChanged) {
      // 检查是否有其他连接已经刷新了 token
      const now = getClaudeAIOAuthTokens()?.accessToken
      if (!now || now === sentToken) return response  // token 没变，真的需要重新认证
    }

    // token 已更新，重试一次
    return (await doRequest()).response
  }
}

```

这个设计处理了一个微妙的并发问题：当 30+ 个 [claude.ai](http://claude.ai) 连接同时启动，都遇到 token 过期时，只有一个连接会成功刷新 token，其他连接应该复用这个新 token 而不是各自触发刷新。

---

### 七、Elicitation：MCP 服务器主动请求用户输入

Elicitation 是 MCP 协议的一个高级特性，允许 MCP 服务器在工具执行过程中主动向用户请求额外信息。

#### 7.1 两种 Elicitation 模式

```TypeScript
// 代码块
// src/services/mcp/elicitationHandler.ts
function getElicitationMode(params: ElicitRequestParams): 'form' | 'url' {
  return params.mode === 'url' ? 'url' : 'form'
}

```

**form 模式**：服务器提供一个表单结构，用户填写后返回。适合需要用户输入参数的场景（如 API 密钥、配置选项）。

**url 模式**：服务器提供一个 URL，用户在浏览器中完成操作（如 OAuth 授权），然后服务器通过 `ElicitationComplete` 通知确认完成。

#### 7.2 Elicitation 的生命周期

```TypeScript
// 代码块
MCP 服务器发送 ElicitRequest
         |
         v
Claude Code 注册 handler，将请求加入队列
         |
         v
UI 显示 Elicitation 对话框（form 或 url）
         |
  用户填写/操作
         |
         v
Claude Code 调用 respond(result)
         |
         v
MCP 服务器收到响应，继续工具执行

```

对于 url 模式，还有第二阶段：用户打开 URL 后，UI 显示「等待确认」状态，直到服务器发送 `ElicitationComplete` 通知。

#### 7.3 Hooks 集成

```TypeScript
// 代码块
// Elicitation 也支持 Hooks 拦截
for await (const hookResult of executeElicitationHooks(
  serverName, requestId, params, signal
)) {
  if (hookResult.elicitationResult) {
    // Hook 直接提供了响应，跳过 UI
    respond(hookResult.elicitationResult)
    return
  }
}

```

这允许自动化脚本通过 Hooks 自动响应 Elicitation 请求，无需用户交互。

---

### 八、会话过期处理

```TypeScript
// 代码块
// 检测 MCP 会话过期（HTTP 404 + JSON-RPC -32001）
export function isMcpSessionExpiredError(error: Error): boolean {
  const httpStatus = 'code' in error ? error.code : undefined
  if (httpStatus !== 404) return false

  // MCP 规范：会话过期时服务器返回 {"error":{"code":-32001,"message":"Session not found"}}
  return (
    error.message.includes('"code":-32001') ||
    error.message.includes('"code": -32001')
  )
}

```

当检测到会话过期时：

```TypeScript
// 代码块
class McpSessionExpiredError extends Error {
  constructor(serverName: string) {
    super(`MCP server "${serverName}" session expired`)
  }
}

// 调用层捕获此错误，清除连接缓存，重新连接
// 然后重试工具调用

```

这处理了 HTTP 传输中的一个常见问题：服务器重启后，旧的会话 ID 失效，客户端需要重新建立连接。

---

### 九、工具调用的完整流程

```TypeScript
// 代码块
模型输出 tool_use（名称：mcp__server__tool）
         |
         v
toolExecution.ts 识别为 MCP 工具（isMcpTool(tool) === true）
         |
         v
MCPTool.call() 被调用
         |
         v
client.callTool({ name: originalToolName, arguments: input })
         |
         v
JSON-RPC 请求通过传输层发送给 MCP 服务器
         |
         v
MCP 服务器执行工具，返回结果
         |
         v
结果内容处理：
  - text -> 直接返回
  - image -> 下采样 + base64 编码
  - resource -> 读取资源内容
  - binary -> 持久化到文件，返回路径
         |
         v
内容大小检查（mcpContentNeedsTruncation）
  - 超过限制 -> 截断 + 提示
         |
         v
PostToolUse Hooks（可修改输出）
         |
         v
工具结果加入对话历史

```

#### 9.1 二进制内容的特殊处理

```TypeScript
// 代码块
// 图片：下采样到合理大小，避免占用过多 token
const resized = await maybeResizeAndDownsampleImageBuffer(buffer, mimeType)

// 非图片二进制（如 PDF、ZIP）：持久化到文件
const savedPath = await persistBinaryContent(content, serverName, toolName)
return getBinaryBlobSavedMessage(savedPath, mimeType)
// 返回类似："Binary content saved to /tmp/mcp-output-xxx.pdf"

```

#### 9.2 工具调用超时

```TypeScript
// 代码块
// 默认超时：~27.8 小时（实际上是无限制）
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 100_000_000

// 可通过环境变量覆盖
function getMcpToolTimeoutMs(): number {
  return parseInt(process.env.MCP_TOOL_TIMEOUT || '', 10) || DEFAULT_MCP_TOOL_TIMEOUT_MS
}

```

为什么默认超时这么长？因为 MCP 工具可能执行长时间任务（如代码编译、数据库查询），设置过短的超时会导致合法操作失败。用户可以通过 `MCP_TOOL_TIMEOUT` 环境变量设置更合理的超时。

---

### 十、IDE 集成：sse-ide 和 ws-ide

Claude Code 支持与 IDE 扩展（VS Code、JetBrains 等）集成，通过专用的 `sse-ide` 和 `ws-ide` 传输协议。

```TypeScript
// 代码块
// IDE 工具白名单：只允许特定工具
const ALLOWED_IDE_TOOLS = ['mcp__ide__executeCode', 'mcp__ide__getDiagnostics']

function isIncludedMcpTool(tool: Tool): boolean {
  return !tool.name.startsWith('mcp__ide__') || ALLOWED_IDE_TOOLS.includes(tool.name)
}

```

IDE 服务器只暴露两个工具：`executeCode`（在 IDE 中执行代码）和 `getDiagnostics`（获取 LSP 诊断信息）。这个白名单防止 IDE 扩展暴露过多工具，保持接口简洁。

---

### 十一、MCP 资源：工具之外的数据访问

除了工具，MCP 还支持「资源」（Resources）——服务器可以暴露文件、数据库记录等静态或动态内容。

```TypeScript
// 代码块
// 列出服务器资源
const ListMcpResourcesTool  // 对应 client.listResources()

// 读取特定资源
const ReadMcpResourceTool   // 对应 client.readResource(uri)

```

资源与工具的区别：工具是「动作」（执行某个操作），资源是「数据」（读取某个内容）。资源有 URI 标识，可以被缓存和订阅变更通知。

---

### 十二、总结：MCP 的设计哲学

#### 12.1 标准化扩展点

MCP 把「工具扩展」从 Claude Code 内部实现变成了开放协议。任何人都可以编写 MCP 服务器，无需了解 Claude Code 的内部实现。这是 Claude Code 生态系统的基础。

#### 12.2 传输无关性

8 种传输协议覆盖了从本地进程到云端服务的所有场景。应用层（工具调用、资源访问）与传输层完全解耦，切换传输协议不需要修改工具实现。

#### 12.3 渐进式认证

认证系统支持无认证（stdio）、静态 token（headers）、OAuth 2.0（sse/http）等多种方式，并有 15 分钟的 needs-auth 缓存避免重复触发认证流程。

#### 12.4 防御性设计

工具描述截断（2048 字符）、二进制内容持久化、内容大小检查、会话过期重连——每一个设计都在防止某种边界情况导致系统崩溃或用户体验变差。

Claude Code 的 MCP 实现是一个生产级的协议客户端，处理了协议规范之外的大量工程细节。理解这些细节，对于开发高质量的 MCP 服务器至关重要。

---

### 十三、给 mini-claude-code 的启示

mini-claude-code 目前只有内置工具，但 MCP 协议提供了一种无需修改核心代码就能扩展工具的方式。最简单的 MCP 客户端实现：

```Python
// 代码块
# mini-claude-code 的极简 MCP 客户端
import subprocess
import json

class MCPStdioClient:
    """通过 stdio 连接 MCP 服务器"""

    def __init__(self, command: str, args: list[str]):
        self.process = subprocess.Popen(
            [command] + args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        self._request_id = 0

    def _send(self, method: str, params: dict) -> dict:
        self._request_id += 1
        request = {"jsonrpc": "2.0", "id": self._request_id, "method": method, "params": params}
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        response = json.loads(self.process.stdout.readline())
        return response.get("result", {})

    def list_tools(self) -> list[dict]:
        """发现服务器提供的工具"""
        result = self._send("tools/list", {})
        return result.get("tools", [])

    def call_tool(self, name: str, arguments: dict) -> str:
        """调用工具"""
        result = self._send("tools/call", {"name": name, "arguments": arguments})
        content = result.get("content", [])
        return "\n".join(c.get("text", "") for c in content if c.get("type") == "text")

```

**最值得从 Claude Code 借鉴的三点**：

第一，**工具名命名规范**：`mcp__{serverName}__{toolName}`。这个前缀让模型能区分内置工具和 MCP 工具，也让权限规则可以按服务器粒度控制（`allow mcp__my-server__*`）。

第二，**工具描述截断**：MCP 服务器的工具描述可能很长，应该在注册时截断到合理长度（如 500 字符），避免工具列表占用过多 token。

第三，**连接失败不阻塞启动**：MCP 服务器连接失败时，应该记录错误但继续启动，让用户仍然可以使用内置工具。Claude Code 的五种连接状态（Connected/Failed/NeedsAuth/Pending/Disabled）就是这种「优雅降级」思想的体现。

---

*下一篇：专题09——多 Agent 系统，深入 Claude Code 如何编排子 Agent 并行工作，以及 verification Agent 独立性原则背后的可靠性设计。*

---
exit_code: 0
elapsed_ms: 6214
ended_at: 2026-06-29T07:47:32.240Z
---
