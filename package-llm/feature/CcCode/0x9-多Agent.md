# 0x9 多 Agent——一个人干不完，就派出一支队伍-副本

> *系列：Claude Code 源码深度研究 · 专题 09 *
> *版本：v2.1.88 · 文件：*`*src/tools/AgentTool/*`* · *`*src/coordinator/*`* · *`*src/tasks/*`

---

### 一、从一个复杂任务说起

你让 Claude Code：「把整个认证模块重构成 OAuth 2.0，同时确保所有测试通过。」它没有直接开始写代码，而是启动了三个子 Agent 并行工作：一个分析现有代码，一个写新实现，一个跑测试验证。

表面上看，Claude Code 把大任务拆成小任务，分给几个 Agent 同时做——不就这样吗？

但真实的实现远比这复杂。子 Agent 要在独立的 Git Worktree 里工作，不能互相干扰；子 Agent 不能再启动子 Agent，防止无限递归；运行超过两分钟要自动切换到后台模式；验证 Agent 必须用全新的上下文，不能让实现 Agent 自我验证。

这篇文章要带你深入 `src/tools/AgentTool/`，看清楚每一个子 Agent 从创建到完成的完整生命周期。

Claude Code 的多 Agent 系统解决了这两个问题：

```TypeScript
// 代码块
用户请求
    |
    v
主 Agent（Coordinator 或普通模式）
    |
    +-- Agent(description="研究认证模块") --> Worker A（并行）
    |
    +-- Agent(description="研究测试覆盖") --> Worker B（并行）
    |
    v
等待结果，综合分析
    |
    +-- SendMessage(to="agent-a1b", "修复 validate.ts:42") --> Worker A 继续
    |
    v
Agent(subagent_type="verification") --> Verifier（独立验证）

```

这不是简单的「调用子进程」，而是一套完整的异步任务编排系统，包含任务注册、进度追踪、消息路由、内存持久化、隔离沙箱等机制。

> 每个子 Agent 都运行独立的 `queryLoop`（→ 参见**专题 01**：查询引擎与对话循环）；子 Agent 的上下文窗口独立管理，各自触发压缩（→ 参见**专题 03**：上下文压缩）；Agent 间通信通过 `SendMessageTool` 实现，该工具遵循统一的工具执行流水线（→ 参见**专题 05**：工具系统）。

---

### 二、Agent 工具的演化：从 Task 到 Agent

```TypeScript
// 代码块
// src/tools/AgentTool/constants.ts
export const AGENT_TOOL_NAME = 'Agent'
// 向后兼容旧名称（权限规则、Hooks、已保存会话中可能用旧名）
export const LEGACY_AGENT_TOOL_NAME = 'Task'

```

工具从 `Task` 改名为 `Agent`，反映了设计理念的转变：从「执行一个任务」到「启动一个具有完整能力的智能体」。旧名称保留为别名，确保已有的权限规则和 Hooks 配置不会失效。

---

### 三、七种任务类型

```TypeScript
// 代码块
// src/Task.ts
export type TaskType =
  | 'local_bash'        // 本地 Shell 命令（BashTool 的后台执行）
  | 'local_agent'       // 本地异步 Agent（最常用）
  | 'remote_agent'      // 远程 CCR 环境中的 Agent（Anthropic 内部）
  | 'in_process_teammate' // 进程内 Teammate（共享内存，低延迟）
  | 'local_workflow'    // 工作流任务（多步骤编排）
  | 'monitor_mcp'       // MCP 监控任务
  | 'dream'             // Dream 任务（实验性）

```

任务 ID 有前缀标识类型：`a-` 是 local_agent，`r-` 是 remote_agent，`t-` 是 in_process_teammate，`b-` 是 local_bash。这让日志和调试时一眼就能识别任务类型。

---

### 四、Agent 的三种运行模式

#### 4.1 同步模式（Sync）

Agent 在父 Agent 的工具调用中同步执行，父 Agent 阻塞等待结果。适合简单的一次性任务。

```TypeScript
// 代码块
// 同步输出
{
  status: 'completed',
  result: '...',
  prompt: '...'
}

```

#### 4.2 异步模式（Async / Background）

Agent 在后台运行，父 Agent 立即收到 `async_launched` 响应，继续处理其他事情。Agent 完成后，结果以 `<task-notification>` XML 的形式注入对话。

```TypeScript
// 代码块
// 异步输出
{
  status: 'async_launched',
  agentId: 'a-x7q3k2m1',
  description: '研究认证模块',
  prompt: '...',
  outputFile: '/tmp/claude-tasks/a-x7q3k2m1/output'
}

```

自动后台化：如果 Agent 运行超过 120 秒（`getAutoBackgroundMs()` 返回 120000），会自动切换到后台模式，避免阻塞主对话。

#### 4.3 Fork 模式（实验性）

```TypeScript
// 代码块
// src/tools/AgentTool/forkSubagent.ts
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false  // 与 Coordinator 模式互斥
    if (getIsNonInteractiveSession()) return false
    return true
  }
  return false
}

```

Fork 模式下，子 Agent 继承父 Agent 的完整对话上下文（包括所有历史消息），而不是从空白开始。这让子 Agent 能直接利用父 Agent 已经探索过的代码上下文，避免重复工作。

关键约束：Fork 子 Agent 不能再 Fork（防止无限递归）。检测方式是查看消息历史中是否有 `FORK_BOILERPLATE_TAG` 标记。

---

### 五、内置 Agent 类型

Claude Code 内置了六种专用 Agent，每种都有精心设计的系统提示和工具限制：

#### 5.1 general-purpose（通用）

```TypeScript
// 代码块
export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: 'general-purpose',
  whenToUse: '通用研究和多步骤任务...',
  tools: ['*'],  // 所有工具
  getSystemPrompt: getGeneralPurposeSystemPrompt,
}

```

系统提示强调：完成任务后返回简洁报告，不要过度设计，不要留下半成品。

#### 5.2 verification（验证专家）

这是最精心设计的 Agent，系统提示长达 130 行，专门对抗 LLM 的「验证回避」倾向：

```TypeScript
// 代码块
你有两种已记录的失败模式：
1. 验证回避：面对检查时找理由不运行——读代码、叙述你会测试什么、写"PASS"然后继续
2. 被前 80% 迷惑：看到精美的 UI 或通过的测试就想给 PASS，没注意到一半按钮没用、
   状态刷新后消失、后端在错误输入时崩溃

```

工具限制：禁止 `Agent`、`FileEdit`、`FileWrite`、`NotebookEdit`（只读验证，不能修改代码）。

输出格式强制要求：每个检查必须包含实际运行的命令和输出，最终必须以 `VERDICT: PASS`、`VERDICT: FAIL` 或 `VERDICT: PARTIAL` 结尾。

**为什么需要专门的 verification Agent？** 这反映了一个深刻的认识：LLM 实现的代码不能自我验证。当同一个 Agent 既负责实现又负责验证时，它会无意识地「确认偏误」——倾向于相信自己的实现是正确的，找理由跳过真正的测试。独立的 verification Agent 以「新鲜视角」审视代码，没有实现者的心理包袱，更容易发现问题。这也是为什么 Coordinator 的决策矩阵明确规定「验证另一个 Worker 写的代码 → 新建 Agent」。

#### 5.3 Plan（规划师）

只读模式，禁止所有文件修改操作。系统提示明确：「你的角色是探索代码库并设计实现计划，不能修改任何文件。」

输出格式要求列出 3-5 个关键文件路径，供后续实现 Agent 使用。

#### 5.4 Explore（探索者）

专门用于代码库探索，`omitClaudeMd: true`（不加载 [CLAUDE.md](http://CLAUDE.md)），节省 token。每周有 3400 万次 Explore 调用，这个优化每周节省约 5-15 Gtok。

#### 5.5 claudeCodeGuide（指南）

提供 Claude Code 使用指导，帮助用户了解功能和最佳实践。

#### 5.6 Fork（隐式 Fork）

不在 `builtInAgents` 注册，只在 Fork 实验开启且 `subagent_type` 未指定时触发。继承父 Agent 的完整工具池（`tools: ['*']`，`useExactTools: true`），确保 API 请求前缀字节完全相同，命中 prompt cache。

---

### 六、Coordinator 模式：专为多 Agent 编排设计

```TypeScript
// 代码块
// src/coordinator/coordinatorMode.ts
export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}

```

Coordinator 模式通过环境变量 `CLAUDE_CODE_COORDINATOR_MODE=1` 启用，给主 Agent 注入一套专门的系统提示，将其变成「编排者」而非「执行者」。

#### 6.1 Coordinator 系统提示的核心设计

Coordinator 的系统提示（370 行）包含几个关键设计原则：

**并行是超能力**：

```TypeScript
// 代码块
并行是你的超能力。Worker 是异步的。只要可能，同时启动独立的 Worker——
不要串行化可以并行的工作，寻找扇出机会。做研究时，覆盖多个角度。
要并行启动 Worker，在一条消息中进行多次工具调用。

```

**永远先综合，再委派**：

```TypeScript
// 代码块
// 反模式——懒惰委派（无论是继续还是新建都是坏的）
Agent({ prompt: "根据你的发现，修复认证 bug", ... })

// 好的——综合后的规格（继续或新建都适用）
Agent({ prompt: "修复 src/auth/validate.ts:42 的空指针。Session 的 user 字段在
会话过期但 token 仍缓存时为 undefined。在访问 user.id 前添加空值检查——
如果为 null，返回 401 和 'Session expired'。提交并报告 hash。", ... })

```

**继续 vs 新建的决策矩阵**：

| 情况 | 机制 | 原因 |
| --- | --- | --- |
| 研究探索了需要编辑的文件 | 继续（SendMessage） | Worker 已有文件上下文 |
| 研究广泛但实现范围窄 | 新建（Agent） | 避免拖带探索噪音 |
| 纠正失败或扩展近期工作 | 继续 | Worker 有错误上下文 |
| 验证另一个 Worker 写的代码 | 新建 | 验证者应以新鲜视角看代码 |

#### 6.2 task-notification：Worker 结果的传递机制

Worker 完成后，结果以 `<task-notification>` XML 注入对话，伪装成用户消息：

```XML
// 代码块
<task-notification>
<task-id>a-x7q3k2m1</task-id>
<status>completed</status>
<summary>Agent "研究认证 bug" 已完成</summary>
<result>在 src/auth/validate.ts:42 发现空指针...</result>
<usage>
  <total_tokens>45231</total_tokens>
  <tool_uses>23</tool_uses>
  <duration_ms>18432</duration_ms>
</usage>
</task-notification>

```

Coordinator 的系统提示明确告知：这些看起来像用户消息，但不是——通过 `<task-notification>` 开头标签识别。永远不要感谢或回应 Worker，直接向用户汇报发现。

---

### 七、SendMessage：Agent 间通信协议

`SendMessageTool` 是多 Agent 系统的通信总线，支持五种消息类型：

#### 7.1 普通消息（继续 Worker）

```TypeScript
// 代码块
SendMessage({ to: "agent-a1b", message: "修复 validate.ts:42...", summary: "修复空指针" })

```

如果目标 Agent 正在运行，消息进入队列，在下一个工具轮次注入。如果 Agent 已停止，自动从磁盘 transcript 恢复并继续。

#### 7.2 广播消息

```TypeScript
// 代码块
SendMessage({ to: "*", message: "用户取消了任务，请停止工作", summary: "取消通知" })

```

向团队中所有 Teammate 广播，通过 mailbox 文件系统实现。

#### 7.3 结构化消息：关机协议

```TypeScript
// 代码块
// 请求关机
SendMessage({ to: "worker-1", message: { type: "shutdown_request", reason: "任务已完成" } })

// 批准关机（Worker 回复）
SendMessage({ to: "team-lead", message: { type: "shutdown_response", request_id: "xxx", approve: true } })

```

关机协议是 Swarm 模式（多 Teammate 协作）的核心机制，确保 Teammate 能优雅退出而不是被强制杀死。

#### 7.4 计划审批协议

```TypeScript
// 代码块
// Worker 请求审批计划
// Leader 批准
SendMessage({ to: "worker-1", message: { type: "plan_approval_response", request_id: "xxx", approve: true } })

```

当 Worker 以 `plan` 权限模式运行时，需要 Leader 审批才能执行写操作。

#### 7.5 跨会话消息（实验性）

```TypeScript
// 代码块
// UDS（Unix Domain Socket）：同机器不同进程
SendMessage({ to: "uds:/tmp/claude-xxx.sock", message: "..." })

// Bridge：跨机器（通过 Anthropic 服务器中转）
SendMessage({ to: "bridge:session-id", message: "..." })

```

跨机器消息需要用户明确授权（`safetyCheck`，不能被 bypass），防止跨机器提示注入攻击。

---

### 八、Agent 内存系统

每个 Agent 类型都有独立的持久化内存目录：

```TypeScript
// 代码块
// src/tools/AgentTool/agentMemory.ts
export type AgentMemoryScope = 'user' | 'project' | 'local'

// user 作用域：~/.claude/agent-memory/<agentType>/
// project 作用域：.claude/agent-memory/<agentType>/
// local 作用域：.claude/agent-memory-local/<agentType>/（不提交到 VCS）

```

内存以 Markdown 文件形式存储，Agent 可以读写这些文件来在会话间保持状态。例如，`verification` Agent 可以记录「这个项目的测试命令是 `npm test`」，下次不需要重新探索。

远程内存支持：设置 `CLAUDE_CODE_REMOTE_MEMORY_DIR` 后，内存持久化到挂载点，支持多机器共享。

---

### 九、工具隔离：哪些工具 Agent 能用？

```TypeScript
// 代码块
// src/tools/AgentTool/agentToolUtils.ts
export function filterToolsForAgent({ tools, isBuiltIn, isAsync, permissionMode }) {
  return tools.filter(tool => {
    // MCP 工具：所有 Agent 都可用
    if (tool.name.startsWith('mcp__')) return true

    // 全局禁止工具（所有 Agent 都不能用）
    if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false

    // 自定义 Agent 额外禁止工具
    if (!isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false

    // 异步 Agent 只能用白名单工具
    if (isAsync && !ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) return false

    return true
  })
}

```

`ALL_AGENT_DISALLOWED_TOOLS` 包含不应该被子 Agent 使用的工具（如直接操作 UI 的工具）。`ASYNC_AGENT_ALLOWED_TOOLS` 是异步 Agent 的白名单，只包含安全的文件操作和 Shell 工具。

---

### 十、Worktree 隔离：安全的并行文件操作

```TypeScript
// 代码块
// Agent 工具支持 isolation: "worktree" 参数
Agent({
  description: "重构认证模块",
  prompt: "...",
  isolation: "worktree"  // 在独立的 git worktree 中运行
})

```

Worktree 隔离创建一个临时的 git worktree，Agent 在其中工作，不影响主工作区。多个 Agent 可以同时在不同 worktree 中修改代码，最后由 Coordinator 合并。

```TypeScript
// 代码块
// src/utils/worktree.ts
export async function createAgentWorktree(agentId: AgentId): Promise<string> {
  const branch = `agent-${agentId}`
  // git worktree add /tmp/claude-worktree-xxx -b agent-xxx
  // 返回 worktree 路径
}

export async function removeAgentWorktree(worktreePath: string): Promise<void> {
  // Agent 完成后清理 worktree
}

```

---

### 十一、进度追踪：实时可见性

```TypeScript
// 代码块
// src/tasks/LocalAgentTask/LocalAgentTask.tsx
export type ProgressTracker = {
  toolUseCount: number
  latestInputTokens: number      // 累计输入 token（API 返回的是累计值）
  cumulativeOutputTokens: number // 累计输出 token（每轮相加）
  recentActivities: ToolActivity[] // 最近 5 个工具调用
}

```

进度追踪有一个微妙的 token 计数设计：Claude API 的 `input_tokens` 是累计值（包含所有历史上下文），而 `output_tokens` 是每轮的增量。所以追踪器保存最新的 `input_tokens`（覆盖），累加 `output_tokens`（相加）。

UI 显示最近 5 个工具活动，让用户知道 Agent 在做什么（「正在读取 src/auth/validate.ts」「正在搜索 validateToken」）。

---

### 十二、Scratchpad：跨 Worker 共享知识

```TypeScript
// 代码块
// src/coordinator/coordinatorMode.ts
if (scratchpadDir && isScratchpadGateEnabled()) {
  content += `\n\nScratchpad 目录：${scratchpadDir}
Worker 可以在这里读写，无需权限提示。
用于持久化的跨 Worker 知识——按工作需要组织文件。`
}

```

Scratchpad 是一个共享目录，所有 Worker 都可以读写，无需权限确认。Coordinator 可以指示 Worker 将研究发现写入 Scratchpad，后续 Worker 直接读取，避免重复探索。

---

### 十三、总结：多 Agent 的设计哲学

#### 13.1 异步优先

所有 Agent 调用都设计为可异步运行。同步模式是特例，异步模式是常态。这让 Coordinator 可以同时管理多个 Worker，而不是串行等待。

#### 13.2 上下文即资产

Fork 模式、`continue vs spawn` 决策、Scratchpad——都是在管理「上下文」这个稀缺资源。好的上下文让 Worker 更高效，坏的上下文（探索噪音）让 Worker 更慢。

#### 13.3 防御性验证

内置 `verification` Agent 的存在，反映了一个深刻认识：LLM 实现的代码不能自我验证。验证者必须独立、怀疑、主动尝试破坏，而不是橡皮图章。

#### 13.4 渐进式复杂度

从单个 Agent 到 Coordinator 模式，再到 Swarm（多 Teammate），Claude Code 的多 Agent 系统支持渐进式复杂度。简单任务用单 Agent，复杂任务用 Coordinator，超大型任务用 Swarm。每一层都有清晰的边界和协议。

---

### 十四、给 mini-claude-code 的启示

mini-claude-code 目前是单 Agent 架构，但多 Agent 的核心思想可以用最简单的方式实现：

```Python
// 代码块
# mini-claude-code 的极简子 Agent 实现
# 对应 Claude Code 的 AgentTool（同步模式）

async def run_subagent(prompt: str, tools: list, max_turns: int = 10) -> str:
    """启动一个子 Agent 执行特定任务，返回结果"""
    messages = [{"role": "user", "content": prompt}]
    turn = 0

    while turn < max_turns:
        response = await call_api(messages, tools)
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # 提取最后一条文本作为结果
            return extract_text(response.content)

        if response.stop_reason == "tool_use":
            tool_results = await execute_tools(response.content)
            messages.append({"role": "user", "content": tool_results})
            turn += 1

    return "Max turns reached"

# 在主 Agent 中调用子 Agent
# 对应 Claude Code 的 Agent({ description: "...", prompt: "..." })
async def agent_tool(description: str, prompt: str) -> str:
    """Agent 工具：启动子 Agent 执行任务"""
    result = await run_subagent(
        prompt=prompt,
        tools=get_safe_tools(),  # 子 Agent 使用受限工具集
    )
    return f"Agent '{description}' completed:\n{result}"

```

**最值得从 Claude Code 借鉴的三个设计**：

第一，**子 Agent 使用受限工具集**。子 Agent 不应该能启动新的子 Agent（防止无限递归），也不应该能修改 UI 状态。`filterToolsForAgent` 的设计思路值得参考。

第二，**120 秒自动后台化**。如果子 Agent 运行超过 2 分钟，应该切换到后台模式，让主 Agent 继续处理其他事情，而不是阻塞等待。这对于长时间运行的任务（如代码编译、测试套件）尤其重要。

第三，**verification Agent 的独立性原则**。当需要验证某个实现时，应该用新的上下文（空白消息历史）启动验证 Agent，而不是让实现 Agent 自我验证。这是提升 Agent 可靠性最简单有效的方法。

---

*下一篇：专题10——Hooks 系统，深入 Claude Code 如何让外部脚本介入 AI 工作流，以及 Stop Hook 的 continue: false 语义如何实现"AI 自我纠错"。*
