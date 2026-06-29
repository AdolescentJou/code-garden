# 0x10 Hooks——把 Claude Code 变成可编程的自动化平台-副本

> *系列：Claude Code 源码深度研究 · 专题 10 *
> *版本：v2.1.88 · 文件：*`*src/utils/hooks/*`* · *`*src/types/hooks.ts*`

---

### 一、从一个自动化需求说起

你希望 Claude Code 每次修改文件后自动跑一遍 ESLint，每次执行 Bash 命令前先检查一下是否安全，任务完成前验证测试是否真的通过了。但你不想改 Claude Code 的源码。

表面上看，这就是个脚本钩子，在特定时机执行用户脚本——不就这样吗？

但真实的实现远比这复杂。Hook 脚本可以通过 stdout 返回结构化数据来影响 Claude 的行为；Stop Hook 可以返回 `continue: false` 让 Claude 继续工作而不是停下来；Hook 配置必须在会话开始时快照，防止恶意代码在运行中篡改钩子；Hook 执行失败要有超时和错误处理。

这篇文章要带你深入 `src/utils/hooks.ts`，看清楚每一个 Hook 从配置到执行的完整机制。

> 交叉引用：Hooks 的 `PreToolUse` 事件与权限系统深度集成（→ 参见**专题 06**：权限系统），`Stop` Hook 中的 Agent 类型与多 Agent 架构相关（→ 参见**专题 09**：多 Agent 系统），Skills 系统也支持内嵌 Hooks（→ 参见**专题 11**：Skills 系统）。

---

### 二、28 种 Hook 事件

```TypeScript
// 代码块
// src/entrypoints/sdk/coreTypes.ts
export const HOOK_EVENTS = [
  // 工具生命周期
  'PreToolUse',          // 工具调用前（可拦截/修改输入）
  'PostToolUse',         // 工具调用成功后（可修改输出）
  'PostToolUseFailure',  // 工具调用失败后

  // 权限系统
  'PermissionRequest',   // 权限请求时（可自动批准/拒绝）
  'PermissionDenied',    // 权限被拒绝后（可触发重试）

  // 会话生命周期
  'SessionStart',        // 会话开始（可注入初始消息）
  'SessionEnd',          // 会话结束（清理工作）
  'Setup',               // 初始化阶段

  // 用户交互
  'UserPromptSubmit',    // 用户提交 prompt 时（可注入上下文）
  'Notification',        // Claude 发送通知时
  'Stop',                // Claude 完成任务时（可阻止完成）
  'StopFailure',         // 任务失败时

  // 子 Agent 生命周期
  'SubagentStart',       // 子 Agent 启动时
  'SubagentStop',        // 子 Agent 停止时

  // 上下文压缩
  'PreCompact',          // 压缩前
  'PostCompact',         // 压缩后

  // 多 Agent 协作
  'TeammateIdle',        // Teammate 空闲时
  'TaskCreated',         // 任务创建时
  'TaskCompleted',       // 任务完成时

  // MCP Elicitation
  'Elicitation',         // MCP 服务器请求用户输入时
  'ElicitationResult',   // Elicitation 完成后

  // 配置与文件系统
  'ConfigChange',        // 配置变更时
  'WorktreeCreate',      // Worktree 创建时
  'WorktreeRemove',      // Worktree 删除时
  'InstructionsLoaded',  // CLAUDE.md 加载时
  'CwdChanged',          // 工作目录变更时
  'FileChanged',         // 监控文件变更时
] as const

```

28 种事件覆盖了 Claude Code 运行的每一个关键节点。

---

### 三、四种 Hook 类型

#### 3.1 command（Shell 命令）

最常用的类型，执行任意 Shell 命令：

```JSON
// 代码块
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/check-command.py",
        "timeout": 30
      }]
    }]
  }
}

```

Hook 通过 stdin 接收 JSON 格式的事件数据，通过 stdout 返回 JSON 格式的响应。

#### 3.2 http（HTTP 请求）

向远程服务发送 HTTP 请求：

```JSON
// 代码块
{
  "hooks": {
    "PostToolUse": [{
      "hooks": [{
        "type": "http",
        "url": "https://my-audit-service.com/hook",
        "method": "POST",
        "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
      }]
    }]
  }
}

```

HTTP Hook 有 SSRF 防护（`ssrfGuard.ts`），防止 Hook 被用来访问内网服务。还有 URL 白名单（`allowedHttpHookUrls`）和环境变量白名单（`httpHookAllowedEnvVars`）。

#### 3.3 prompt（LLM 提示）

用自然语言描述 Hook 逻辑，由小型快速模型执行：

```JSON
// 代码块
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "prompt",
        "prompt": "检查对话记录，确认用户要求的所有功能都已实现。如果有遗漏，返回 ok: false 并说明原因。"
      }]
    }]
  }
}

```

#### 3.4 agent（Agent Hook）

最强大的类型，启动一个完整的 Claude Agent 来执行验证逻辑：

```JSON
// 代码块
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "agent",
        "prompt": "验证所有测试通过，代码符合项目规范。",
        "model": "claude-haiku-3-5"
      }]
    }]
  }
}

```

Agent Hook 可以使用所有工具（读文件、运行命令等），最多执行 50 轮，通过 `SyntheticOutputTool` 返回结构化结果 `{ ok: boolean, reason?: string }`。

---

### 四、Hook 的输入：JSON 上下文

每个 Hook 执行时，Claude Code 通过 stdin 传入丰富的上下文：

```TypeScript
// 代码块
// 基础字段（所有 Hook 都有）
{
  session_id: string,       // 当前会话 ID
  transcript_path: string,  // 对话记录文件路径
  cwd: string,              // 当前工作目录
  permission_mode?: string, // 权限模式（default/plan/dontAsk）
  agent_id?: string,        // 子 Agent ID（如果在子 Agent 中）
  agent_type?: string,      // Agent 类型
}

// PreToolUse 额外字段
{
  tool_name: string,        // 工具名称（如 "Bash"）
  tool_input: object,       // 工具输入参数
}

// PostToolUse 额外字段
{
  tool_name: string,
  tool_input: object,
  tool_response: object,    // 工具执行结果
}

// SessionStart 额外字段
{
  initial_message?: string, // 初始用户消息
}

```

---

### 五、Hook 的输出：JSON 响应协议

Hook 通过 stdout 返回 JSON 来控制 Claude Code 的行为：

#### 5.1 通用字段

```JSON
// 代码块
{
  "continue": false,          // 阻止 Claude 继续（Stop Hook 专用）
  "stopReason": "测试未通过",  // 阻止原因（显示给用户）
  "decision": "block",        // "approve" 或 "block"
  "reason": "命令不安全",      // 决策原因
  "systemMessage": "警告：...", // 显示给用户的警告
  "suppressOutput": true       // 隐藏 Hook 的 stdout 输出
}

```

#### 5.2 PreToolUse 专用

```JSON
// 代码块
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",  // "allow" | "deny" | "ask"
    "permissionDecisionReason": "命令已审核",
    "updatedInput": {               // 修改工具输入！
      "command": "ls -la /safe/path"
    },
    "additionalContext": "已将路径限制到安全目录"
  }
}

```

`updatedInput` 是一个强大的功能：Hook 可以在工具执行前修改其输入参数。例如，自动将危险命令替换为安全版本，或添加必要的参数。

#### 5.3 PostToolUse 专用

```JSON
// 代码块
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "文件已格式化",
    "updatedMCPToolOutput": { ... }  // 修改 MCP 工具的输出
  }
}

```

#### 5.4 SessionStart 专用

```JSON
// 代码块
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "项目使用 TypeScript 5.0，测试框架为 Vitest",
    "initialUserMessage": "请先阅读 ARCHITECTURE.md",
    "watchPaths": ["/path/to/watch"]  // 注册 FileChanged 监控路径
  }
}

```

`initialUserMessage` 让 Hook 可以在会话开始时自动注入一条用户消息，实现「自动化引导」。

---

### 六、同步 vs 异步 Hook

#### 6.1 同步 Hook（默认）

Hook 执行完成后，Claude Code 才继续。适合快速检查（< 10 秒）。

#### 6.2 异步 Hook

Hook 立即返回 `{ "async": true, "asyncTimeout": 30000 }`，在后台继续运行。Claude Code 不等待，继续处理其他事情。

```Shell
// 代码块
#!/bin/bash
# 立即返回异步标记
echo '{"async": true, "asyncTimeout": 30000}'

# 在后台执行耗时操作
run_slow_audit &

# 如果需要阻止 Claude，在后台完成后输出 JSON
# Claude Code 会在下一个工具轮次检查异步 Hook 的结果

```

异步 Hook 的结果通过 `AsyncHookRegistry` 管理：

```TypeScript
// 代码块
// src/utils/hooks/AsyncHookRegistry.ts
const pendingHooks = new Map<string, PendingAsyncHook>()

// 每个工具轮次检查是否有异步 Hook 完成
export async function checkForAsyncHookResponses(): Promise<...> {
  // 扫描所有 pending hooks
  // 如果 shellCommand.status === 'completed'，读取输出并处理
  // 如果超时，取消并报告错误
}

```

异步 Hook 的进度通过 `startHookProgressInterval` 每秒轮询一次，实时显示给用户。

---

### 七、Matcher：精确控制触发条件

```JSON
// 代码块
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",           // 只匹配 Bash 工具
        "hooks": [{ "type": "command", "command": "check-bash.sh" }]
      },
      {
        "matcher": "Bash(git *)",    // 只匹配 git 命令
        "hooks": [{ "type": "command", "command": "check-git.sh" }]
      },
      {
        "matcher": "mcp__*",         // 匹配所有 MCP 工具
        "hooks": [{ "type": "command", "command": "check-mcp.sh" }]
      }
    ]
  }
}

```

Matcher 支持通配符，可以精确控制哪些工具触发哪些 Hook。`Bash(git *)` 这种语法可以匹配特定命令模式。

---

### 八、Hook 来源与优先级

```TypeScript
// 代码块
// src/utils/hooks/hooksSettings.ts
export type HookSource =
  | 'userSettings'     // ~/.claude/settings.json（用户级）
  | 'projectSettings'  // .claude/settings.json（项目级）
  | 'localSettings'    // .claude/settings.local.json（本地，不提交）
  | 'policySettings'   // 企业策略（最高优先级）
  | 'pluginHook'       // 插件提供的 Hook
  | 'sessionHook'      // 运行时动态注册的 Hook
  | 'builtinHook'      // Claude Code 内置 Hook

```

优先级：`policySettings` > `userSettings` > `projectSettings` > `localSettings` > `pluginHook` > `builtinHook`

企业可以通过 `allowManagedHooksOnly: true` 禁止用户自定义 Hook，只允许管理员配置的 Hook 运行。

---

### 九、安全机制

#### 9.1 工作区信任检查

```TypeScript
// 代码块
export function shouldSkipHookDueToTrust(): boolean {
  const isInteractive = !getIsNonInteractiveSession()
  if (!isInteractive) return false  // SDK 模式：信任隐式

  // 交互模式：所有 Hook 都需要工作区信任
  const hasTrust = checkHasTrustDialogAccepted()
  return !hasTrust
}

```

在用户接受信任对话框之前，所有 Hook 都不会执行。这防止了恶意项目通过 `.claude/settings.json` 中的 Hook 在用户不知情的情况下执行代码。

历史漏洞：曾经存在 `SessionEnd` Hook 在用户拒绝信任对话框时仍然执行的 bug，以及 `SubagentStop` Hook 在子 Agent 完成时（信任建立前）执行的 bug。现在统一在执行前检查信任状态。

#### 9.2 HTTP Hook 的 SSRF 防护

```TypeScript
// 代码块
// src/utils/hooks/ssrfGuard.ts
export async function ssrfGuardedLookup(url: string): Promise<void> {
  // 解析 URL 的 IP 地址
  // 拒绝私有 IP 范围（10.x.x.x, 172.16.x.x, 192.168.x.x, 127.x.x.x）
  // 防止 Hook 被用来访问内网服务
}

```

#### 9.3 HTTP Hook URL 白名单

```JSON
// 代码块
{
  "allowedHttpHookUrls": [
    "https://my-audit-service.com/*",
    "https://api.example.com/hooks"
  ]
}

```

只有白名单中的 URL 才能被 HTTP Hook 访问。

#### 9.4 Agent Hook 的工具限制

```TypeScript
// 代码块
// execAgentHook.ts
const tools: Tool[] = [
  ...filteredTools.filter(
    tool => !ALL_AGENT_DISALLOWED_TOOLS.has(tool.name),
  ),
  structuredOutputTool,
]

```

Agent Hook 不能使用 `Agent`（防止递归）、`ExitPlanMode` 等工具，且权限模式强制为 `dontAsk`（不弹权限确认框）。

---

### 十、Stop Hook：最强大的 Hook

`Stop` Hook 在 Claude 认为任务完成时触发，可以阻止 Claude 停止并要求它继续工作。

```Shell
// 代码块
#!/bin/bash
# stop-hook.sh：验证所有测试通过

INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path')

# 运行测试
cd $(echo "$INPUT" | jq -r '.cwd')
TEST_RESULT=$(npm test 2>&1)

if echo "$TEST_RESULT" | grep -q "FAIL"; then
  echo '{
    "continue": false,
    "stopReason": "测试未通过，请修复失败的测试后再完成任务"
  }'
else
  echo '{"continue": true}'
fi

```

`continue: false` 会阻止 Claude 停止，并将 `stopReason` 作为系统消息注入对话，让 Claude 知道为什么不能停止。

---

### 十一、SessionStart Hook：会话初始化

`SessionStart` Hook 是最灵活的 Hook 之一，可以：

1. 注入额外上下文（`additionalContext`）：告诉 Claude 项目的技术栈、规范等
2. 注入初始消息（`initialUserMessage`）：自动发送第一条用户消息
3. 注册文件监控（`watchPaths`）：监控特定文件变化，触发 `FileChanged` Hook

```Shell
// 代码块
#!/bin/bash
# session-start.sh

PROJECT_INFO=$(cat package.json | jq -r '.name + " v" + .version')
TECH_STACK=$(cat .claude/tech-stack.txt 2>/dev/null || echo "")

echo "{
  \"hookSpecificOutput\": {
    \"hookEventName\": \"SessionStart\",
    \"additionalContext\": \"项目：${PROJECT_INFO}\\n技术栈：${TECH_STACK}\",
    \"watchPaths\": [\"$(pwd)/src\", \"$(pwd)/tests\"]
  }
}"

```

---

### 十二、FileChanged Hook：响应文件变化

当 `SessionStart` 或 `CwdChanged` Hook 注册了 `watchPaths` 后，Claude Code 会监控这些路径。文件变化时触发 `FileChanged` Hook：

```JSON
// 代码块
{
  "hooks": {
    "FileChanged": [{
      "hooks": [{
        "type": "command",
        "command": "notify-file-change.sh"
      }]
    }]
  }
}

```

这让 Claude Code 可以响应外部文件变化，例如：CI 系统更新了测试结果文件，Claude 自动读取并处理。

---

### 十三、Hook 执行超时

```TypeScript
// 代码块
// 工具 Hook（PreToolUse、PostToolUse 等）：10 分钟
const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000

// SessionEnd Hook：1.5 秒（默认）
// 可通过 CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS 覆盖
const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500

```

`SessionEnd` Hook 超时极短（1.5 秒），因为它在会话关闭时执行，不能阻塞退出流程。如果清理脚本需要更多时间，可以通过环境变量调整。

---

### 十四、总结：Hooks 的设计哲学

#### 14.1 可观测性优先

28 种事件覆盖了 Claude Code 的每一个关键节点，让用户可以完整观测 Claude 的行为。`transcript_path` 让 Hook 可以读取完整的对话历史，做出基于上下文的决策。

#### 14.2 渐进式能力

从简单的 Shell 命令，到 HTTP 请求，到 LLM 提示，到完整的 Agent——Hook 类型的能力逐级递增。简单场景用 command，复杂验证用 agent。

#### 14.3 双向控制

Hook 不只是「观察者」，还是「控制者」：可以修改工具输入（`updatedInput`）、修改工具输出（`updatedMCPToolOutput`）、阻止操作（`decision: "block"`）、阻止完成（`continue: false`）。这让 Hook 成为真正的「中间件」。

#### 14.4 安全第一

工作区信任检查、SSRF 防护、URL 白名单、Agent Hook 工具限制——每一层都有安全保护。企业可以通过 `allowManagedHooksOnly` 完全锁定 Hook 配置，防止用户绕过安全策略。

#### 14.5 为什么 Hook 要在会话开始时快照配置？

这是一个容易被忽视但至关重要的安全设计。`captureHooksConfigSnapshot()` 在 `setup()` 阶段只运行一次，之后所有 Hook 执行都基于这个快照，而不是实时读取 `settings.json`。

原因在于：如果 Hook 配置是实时读取的，一个恶意的 `PostToolUse` Hook 可以在执行过程中修改 `settings.json`，注入新的 Hook 来影响后续的工具调用。这是一种"Hook 注入"攻击——通过 Hook 来修改 Hook 配置，形成自我强化的恶意循环。

快照机制切断了这个循环：无论 `settings.json` 在会话中如何变化，当前会话的 Hook 行为都是确定的、不可被中途篡改的。这与 Git 的"提交不可变"原则异曲同工——一旦会话开始，Hook 配置就被"提交"了。

---

### 十五、给 mini-claude-code 的启示

mini-claude-code 目前没有 Hooks 系统，但可以用最简单的方式实现核心功能：

```Python
// 代码块
# mini-claude-code 的极简 Hook 系统
# 对应 Claude Code 的 PreToolUse / PostToolUse Hook

from typing import Callable, Optional
import subprocess, json

# Hook 注册表（在会话开始时快照，不允许运行时修改）
_hooks: dict[str, list[dict]] = {}
_hooks_snapshot: dict[str, list[dict]] = {}

def register_hook(event: str, command: str, matcher: Optional[str] = None):
    """注册一个 command 类型的 Hook"""
    _hooks.setdefault(event, []).append({
        "command": command,
        "matcher": matcher,
    })

def snapshot_hooks():
    """会话开始时调用，冻结 Hook 配置（防止运行时篡改）"""
    import copy
    global _hooks_snapshot
    _hooks_snapshot = copy.deepcopy(_hooks)

def run_hooks(event: str, context: dict) -> dict:
    """
    执行指定事件的所有 Hook，返回合并后的响应。
    对应 Claude Code 的 executeHooks()
    """
    hooks = _hooks_snapshot.get(event, [])
    result = {"continue": True}

    for hook in hooks:
        # 检查 matcher（简化版：只做工具名精确匹配）
        if hook.get("matcher") and context.get("tool_name") != hook["matcher"]:
            continue

        try:
            proc = subprocess.run(
                hook["command"], shell=True,
                input=json.dumps(context).encode(),
                capture_output=True, timeout=30
            )
            if proc.stdout:
                response = json.loads(proc.stdout)
                result.update(response)
                # 如果 Hook 要求阻止，立即停止
                if response.get("decision") == "block":
                    break
        except Exception as e:
            print(f"Hook error: {e}")

    return result

```

**最值得从 Claude Code 借鉴的两个设计**：

第一，**会话开始时快照 Hook 配置**。这是防止 Hook 注入攻击的关键。`snapshot_hooks()` 应该在第一个工具调用之前调用，之后的 `_hooks` 修改不影响当前会话。

第二，**Stop Hook 的 continue: false 语义**。这是 Hooks 系统最强大的能力——让外部脚本决定 AI 是否真的完成了任务。在 mini-claude-code 中，可以在主循环的 `stop_reason == "end_turn"` 处调用 Stop Hook，如果返回 `continue: false`，则把 `stopReason` 作为新的用户消息注入，让 AI 继续工作。

---

*下一篇：专题11——Skills 系统，深入 Claude Code 如何通过声明式工作流让模型自主决定调用时机，以及安全属性白名单的 fail-safe 设计。*
