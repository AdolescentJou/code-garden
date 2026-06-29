# 0x11 Skills——一个 Markdown 文件，一条斜杠命令-副本

> 系列：Claude Code 源码深度研究 · 专题 11
> 版本：v2.1.88 · 文件：`src/skills/` · `src/tools/SkillTool/`

---

### 一、从一个斜杠命令说起

你在 Claude Code 里输入 `/commit`，它自动分析了 git diff，生成了一条规范的 commit message，还帮你执行了提交。这个能力不是硬编码在 Claude Code 里的——它来自一个 Markdown 文件。

表面上看，Skills 就是把提示词写进文件，用斜杠命令触发——不就这样吗？

但真实的实现远比这复杂。Skills 有五种来源（项目级、用户级、内置、MCP、动态发现），有两种执行模式（直接注入和 Fork 子 Agent），有条件激活逻辑，有安全属性白名单，还有内置于二进制的 Bundled Skills。Claude Code 为此构建了一套完整的发现、加载、权限、执行流水线。

这篇文章要带你深入 `src/skills/`，看清楚每一个斜杠命令从输入到执行的完整链路。

> 交叉引用：Skills 的 Fork 执行模式依赖多 Agent 架构（→ 参见**专题 09**：多 Agent 系统），Skills 内嵌的 Hooks 字段与 Hooks 系统集成（→ 参见**专题 10**：Hooks 系统），Skills 的权限决策与权限系统共享规则引擎（→ 参见**专题 06**：权限系统）。

---

### 二、五种来源与加载优先级

Skills 按来源分为五类，加载时按以下优先级合并：

```TypeScript
// 代码块
policySettings (managed)  ← 企业策略，最高优先级
  userSettings (~/.claude/skills/)
    projectSettings (.claude/skills/)
      additionalDirs (--add-dir)
        commands_DEPRECATED (.claude/commands/)  ← 旧格式兼容
          bundled (编译进二进制)
            mcp (MCP 服务器提供)

```

`getSkillDirCommands()` 是核心加载函数，用 `memoize` 缓存结果，内部并行发起所有 I/O。

**为什么要 memoize？** Skills 列表在每次 Claude 回复时都需要注入到 SkillTool 的 prompt 中，如果每次都重新扫描文件系统，在一个有 50 个 skills 的项目里，每轮对话都会产生数十次 `fs.stat` 调用。memoize 把这个开销从"每轮 O(n)"降到"整个会话 O(1)"。代价是：如果用户在会话中新增了 skill 文件，需要通过动态发现机制（`discoverSkillDirsForPaths`）来触发缓存失效，而不是自动感知。这是一个有意识的性能与实时性的权衡。

```TypeScript
// 代码块
const [managedSkills, userSkills, projectSkillsNested,
       additionalSkillsNested, legacyCommands] = await Promise.all([
  loadSkillsFromSkillsDir(managedSkillsDir, 'policySettings'),
  loadSkillsFromSkillsDir(userSkillsDir, 'userSettings'),
  Promise.all(projectSkillsDirs.map(dir =>
    loadSkillsFromSkillsDir(dir, 'projectSettings'))),
  Promise.all(additionalDirs.map(dir =>
    loadSkillsFromSkillsDir(join(dir, '.claude', 'skills'), 'projectSettings'))),
  loadSkillsFromCommandsDir(cwd),
])

```

五路并行，互不依赖，充分利用 Bun 的异步 I/O。

---

### 三、目录格式：新旧两套规范

#### 新格式（`/skills/` 目录，推荐）

```TypeScript
// 代码块
.claude/skills/
  my-skill/
    SKILL.md        ← 必须是目录 + SKILL.md
    helper.sh       ← 可附带任意辅助文件

```

`loadSkillsFromSkillsDir` 只接受目录格式，单个 `.md` 文件会被跳过。目录名即 skill 名。

#### 旧格式（`/commands/` 目录，兼容）

```TypeScript
// 代码块
.claude/commands/
  my-command.md           ← 单文件格式
  my-skill/
    SKILL.md              ← 目录格式（取父目录名）
    helper.sh

```

旧格式通过 `transformSkillFiles` 处理：若目录内存在 `SKILL.md`，则只加载该文件并以目录名命名；否则加载所有 `.md` 文件。

#### 命名空间

嵌套目录自动生成命名空间，用冒号分隔：

```TypeScript
// 代码块
.claude/skills/
  review/
    pr/
      SKILL.md    → skill 名: review:pr

```

---

### 四、Frontmatter 元数据全解

每个 `SKILL.md` 的 YAML frontmatter 控制 skill 的全部行为：

```YAML
// 代码块
---
name: "My Skill"                    # 显示名（可选，默认用目录名）
description: "一句话描述"
when_to_use: |                      # 告诉模型何时自动调用
  Use when the user wants to...
  Examples: 'do X', 'run Y'
argument-hint: "<arg1> [arg2]"      # 参数提示
arguments:                          # 参数名列表（用于 $arg 替换）
  - arg1
  - arg2
allowed-tools:                      # 允许使用的工具（白名单）
  - Bash(git:*)
  - Read
  - Write
model: claude-opus-4-5              # 模型覆盖（可选）
effort: high                        # 努力等级（low/medium/high 或整数）
context: fork                       # 执行模式（inline 或 fork）
user-invocable: true                # 是否可被用户手动调用
disable-model-invocation: false     # 禁止模型自动调用
paths:                              # 条件激活路径（gitignore 语法）
  - "src/**/*.ts"
  - "*.py"
hooks:                              # 内嵌 Hooks（同 settings.json 格式）
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: command
          command: "npm run lint"
version: "1.0"
---

# Skill 正文（Markdown）
...

```

`parseSkillFrontmatterFields` 负责解析所有字段，返回强类型结构体。

---

### 五、`getPromptForCommand`：运行时内容生成

Skill 的 Markdown 内容不是静态的——每次调用时动态生成，支持三种替换：

#### 1. 参数替换（`$arg_name` 或 `$ARGUMENTS`）

```Markdown
// 代码块
# Review PR

Review pull request $pr_number with focus on $focus_area.

```

调用时 `substituteArguments` 将 `$pr_number` 替换为实际参数值。

#### 2. 内置变量替换

```Markdown
// 代码块
Base directory: ${CLAUDE_SKILL_DIR}
Session: ${CLAUDE_SESSION_ID}

```

`${CLAUDE_SKILL_DIR}` 替换为 skill 所在目录的绝对路径，让 skill 可以引用同目录下的辅助文件。`${CLAUDE_SESSION_ID}` 替换为当前会话 ID。

#### 3. Shell 命令内联执行（`!` 语法）

```Markdown
// 代码块
Current git status:
!`git status --short`

```

`executeShellCommandsInPrompt` 在 skill 加载时执行这些命令，将输出内联到提示词中。**注意：MCP Skills 禁止此功能**（安全考虑，远程内容不可信）。

---

### 六、两种执行模式：Inline vs Fork

#### Inline（默认）

Skill 内容作为用户消息注入当前对话，Claude 在同一上下文中处理。适合需要与用户交互、需要访问对话历史的场景。

```TypeScript
// 代码块
用户: /commit
  → SkillTool.call()
  → processPromptSlashCommand()
  → 生成 newMessages（含 skill 内容）
  → 注入主对话流
  → Claude 在当前上下文执行

```

#### Fork（`context: fork`）

Skill 在独立子 Agent 中执行，有自己的 token 预算和上下文。适合自包含的任务，不需要用户中途干预。

```TypeScript
// 代码块
用户: /batch migrate from react to vue
  → SkillTool.call()
  → executeForkedSkill()
  → prepareForkedCommandContext()
  → runAgent()（独立子 Agent）
  → 收集 agentMessages
  → extractResultText()
  → 返回结果摘要给主对话

```

Fork 模式的关键代码：

```TypeScript
// 代码块
async function executeForkedSkill(command, commandName, args, context, ...) {
  const { modifiedGetAppState, baseAgent, promptMessages, skillContent } =
    await prepareForkedCommandContext(command, args, context)

  const agentDefinition = command.effort !== undefined
    ? { ...baseAgent, effort: command.effort }
    : baseAgent

  for await (const message of runAgent({
    agentDefinition, promptMessages,
    toolUseContext: { ...context, getAppState: modifiedGetAppState },
    canUseTool, isAsync: false, querySource: 'agent:custom',
    model: command.model as ModelAlias | undefined,
  })) {
    agentMessages.push(message)
    // 实时上报进度
    if (onProgress && hasToolContent(message)) {
      onProgress({ data: { message, type: 'skill_progress', ... } })
    }
  }

  return { data: { success: true, status: 'forked', result: extractResultText(agentMessages) } }
}

```

---

### 七、权限系统：三层决策

`SkillTool.checkPermissions` 实现了三层权限决策：

#### 第一层：Deny 规则（最高优先级）

规则支持精确匹配（`commit`）和前缀通配（`review:*`）。

```TypeScript
// 代码块
const denyRules = getRuleByContentsForTool(permissionContext, SkillTool, 'deny')
for (const [ruleContent, rule] of denyRules.entries()) {
  if (ruleMatches(ruleContent)) {
    return { behavior: 'deny', message: 'Skill execution blocked by permission rules' }
  }
}

```

#### 第二层：Allow 规则

```TypeScript
// 代码块
const allowRules = getRuleByContentsForTool(permissionContext, SkillTool, 'allow')
for (const [ruleContent, rule] of allowRules.entries()) {
  if (ruleMatches(ruleContent)) {
    return { behavior: 'allow', updatedInput: { skill, args } }
  }
}

```

#### 第三层：安全属性自动放行

这是最精妙的设计——如果一个 skill 只使用"安全属性"（不含 `hooks`、`allowedTools` 等敏感字段），则自动放行，无需用户确认：

```TypeScript
// 代码块
const SAFE_SKILL_PROPERTIES = new Set([
  'type', 'name', 'description', 'model', 'effort',
  'source', 'paths', 'version', 'userInvocable', 'loadedFrom',
  // ... 共约 20 个安全属性
])

function skillHasOnlySafeProperties(command: Command): boolean {
  for (const key of Object.keys(command)) {
    if (SAFE_SKILL_PROPERTIES.has(key)) continue
    const value = command[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    return false  // 有非安全属性 → 需要权限
  }
  return true
}

```

这个设计的妙处在于：新增属性默认需要权限（fail-safe），只有明确审查后才加入白名单。

---

### 八、动态发现：文件操作触发加载

Skills 不仅在启动时加载，还会在会话中动态发现。当 Claude 读写文件时，系统会检查文件路径附近是否有新的 `.claude/skills/` 目录：

```TypeScript
// 代码块
export async function discoverSkillDirsForPaths(
  filePaths: string[],
  cwd: string,
): Promise<string[]> {
  for (const filePath of filePaths) {
    let currentDir = dirname(filePath)

    // 从文件目录向上走，直到 cwd（不含 cwd 本身）
    while (currentDir.startsWith(resolvedCwd + pathSep)) {
      const skillDir = join(currentDir, '.claude', 'skills')

      if (!dynamicSkillDirs.has(skillDir)) {
        dynamicSkillDirs.add(skillDir)  // 记录已检查，避免重复 stat
        try {
          await fs.stat(skillDir)
          // 检查是否被 gitignore（防止 node_modules 中的 skills 被加载）
          if (await isPathGitignored(currentDir, resolvedCwd)) continue
          newDirs.push(skillDir)
        } catch { /* 目录不存在，跳过 */ }
      }

      currentDir = dirname(currentDir)
    }
  }

  // 深度优先排序：更靠近文件的 skill 优先级更高
  return newDirs.sort((a, b) => b.split(pathSep).length - a.split(pathSep).length)
}

```

发现新目录后，`addSkillDirectories` 加载 skills 并通过 `skillsLoaded` 信号通知所有监听者（如 prompt 缓存清理）。

---

### 九、条件激活：路径感知的 Skills

Frontmatter 中的 `paths` 字段让 skill 只在操作特定文件时才激活：

```YAML
// 代码块
---
name: python-style
description: Python 代码风格检查
paths:
  - "**/*.py"
  - "src/python/**"
---

```

这类 skill 在加载时不进入活跃列表，而是存入 `conditionalSkills` Map。当 Claude 操作文件时，`activateConditionalSkillsForPaths` 用 `ignore` 库（gitignore 语法）匹配路径：

```TypeScript
// 代码块
export function activateConditionalSkillsForPaths(
  filePaths: string[],
  cwd: string,
): string[] {
  for (const [name, skill] of conditionalSkills) {
    const skillIgnore = ignore().add(skill.paths)
    for (const filePath of filePaths) {
      const relativePath = relative(cwd, filePath)
      if (skillIgnore.ignores(relativePath)) {
        // 激活：移入 dynamicSkills，从 conditionalSkills 删除
        dynamicSkills.set(name, skill)
        conditionalSkills.delete(name)
        activatedConditionalSkillNames.add(name)  // 跨缓存清理存活
        activated.push(name)
        break
      }
    }
  }
  return activated
}

```

一旦激活，即使缓存被清理，`activatedConditionalSkillNames` 也会记住该 skill 已激活，防止重复触发。

---

### 十、Bundled Skills：编译进二进制的内置技能

Bundled Skills 是随 CLI 发布的内置 skills，通过 `registerBundledSkill` 注册，存储在内存中（不是文件）。

#### 注册机制

```TypeScript
// 代码块
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  const command: Command = {
    type: 'prompt',
    name: definition.name,
    source: 'bundled',
    loadedFrom: 'bundled',
    getPromptForCommand: definition.getPromptForCommand,
    // ...
  }
  bundledSkills.push(command)
}

```

#### 内置 Skills 清单

| Skill | 功能 | 特殊机制 |
| --- | --- | --- |
| `batch` | 并行大规模变更（5-30 个 worktree Agent） | 动态构建 prompt，fork 模式 |
| `skillify` | 将当前会话流程固化为 skill | 读取 session memory + 用户消息 |
| `verify` | 运行应用验证代码变更 | 附带辅助文件（`files` 字段） |
| `simplify` | 代码简化审查 | 内联 prompt |
| `remember` | 持久化记忆 | 写入 session memory |
| `stuck` | 卡住时的调试助手 | 内联 prompt |
| `debug` | 调试模式 | 内联 prompt |
| `keybindings` | 快捷键配置 | 内联 prompt |
| `loop` | 定时循环任务 | KAIROS feature flag 条件注册 |

#### 附带文件的 Bundled Skills

`verify` skill 附带辅助文件（如 schema、脚本），通过 `files` 字段声明：

```TypeScript
// 代码块
registerBundledSkill({
  name: 'verify',
  files: SKILL_FILES,  // Record<string, string>
  async getPromptForCommand(args) { ... }
})

```

首次调用时，`extractBundledSkillFiles` 将文件写入 `~/.claude/bundled-skills/<nonce>/verify/`，并在 prompt 前加上 `Base directory for this skill: <dir>`。写入使用 `O_EXCL | O_NOFOLLOW` 防止符号链接攻击。

---

### 十一、MCP Skills：远程服务器提供的技能

MCP（Model Context Protocol）服务器可以提供 skills，通过 `mcpSkillBuilders.ts` 的注册表机制避免循环依赖：

```TypeScript
// 代码块
// mcpSkillBuilders.ts — 依赖图叶节点，不导入任何业务模块
let builders: MCPSkillBuilders | null = null

export function registerMCPSkillBuilders(b: MCPSkillBuilders): void {
  builders = b  // loadSkillsDir.ts 模块初始化时调用
}

```

MCP Skills 的限制：禁止 `!command` 内联 Shell 执行（远程内容不可信），`${CLAUDE_SKILL_DIR}` 无意义（无本地目录），通过 `loadedFrom === 'mcp'` 标记在执行时跳过 Shell 替换。

---

### 十二、Skill 列表的 Token 预算管理

SkillTool 的 prompt 包含所有可用 skills 的列表，但 token 有限。`formatCommandsWithinBudget` 实现了精细的预算分配：

```TypeScript
// 代码块
export const SKILL_BUDGET_CONTEXT_PERCENT = 0.01  // 上下文窗口的 1%
export const MAX_LISTING_DESC_CHARS = 250          // 每条描述最多 250 字符

export function formatCommandsWithinBudget(commands, contextWindowTokens) {
  const budget = getCharBudget(contextWindowTokens)

  // 先尝试完整描述
  if (fullTotal <= budget) return fullEntries.join('\n')

  // 超出预算：Bundled skills 永不截断，其余按比例压缩
  const maxDescLen = Math.floor(availableForDescs / restCommands.length)

  if (maxDescLen < MIN_DESC_LENGTH) {
    // 极端情况：非 bundled skills 只显示名称
    return commands.map((cmd, i) =>
      bundledIndices.has(i) ? fullEntry : `- ${cmd.name}`
    ).join('\n')
  }

  // 正常截断
  return commands.map((cmd, i) =>
    bundledIndices.has(i) ? fullEntry : `- ${cmd.name}: ${truncate(desc, maxDescLen)}`
  ).join('\n')
}

```

Bundled skills 永远保留完整描述；用户自定义 skills 在预算紧张时会被截断甚至只显示名称。

---

### 十三、Skillify：自动生成 Skill 的 Skill

`skillify` 是 Skills 系统最有趣的元功能——一个用来创建 skills 的 skill。它在会话结束时调用，分析会话历史，通过多轮问答引导用户将流程固化为可复用的 [SKILL.md](http://SKILL.md)：

```TypeScript
// 代码块
async getPromptForCommand(args, context) {
  const sessionMemory = await getSessionMemoryContent()
  const userMessages = extractUserMessages(
    getMessagesAfterCompactBoundary(context.messages)
  )

  return [{ type: 'text', text: SKILLIFY_PROMPT
    .replace('{{sessionMemory}}', sessionMemory)
    .replace('{{userMessages}}', userMessages.join('\n\n---\n\n'))
    .replace('{{userDescriptionBlock}}', args ? `The user described this process as: "${args}"` : '')
  }]
}

```

Skillify 的四轮问答流程：Round 1 确认名称和描述，Round 2 确认步骤、参数、执行模式和保存位置，Round 3 逐步细化每个步骤的成功标准和并行性，Round 4 确认触发时机和触发短语。最终生成标准格式的 [SKILL.md](http://SKILL.md)。

---

### 十四、去重机制：symlink 安全处理

多个来源可能加载同一个文件（通过 symlink 或重叠的父目录）。去重使用 `realpath` 解析真实路径，而非 inode（inode 在某些文件系统上不可靠，如 ExFAT 的 inode 0 问题）：

```TypeScript
// 代码块
async function getFileIdentity(filePath: string): Promise<string | null> {
  try {
    return await realpath(filePath)  // 解析 symlink 到规范路径
  } catch {
    return null
  }
}

// 并行解析所有文件的真实路径，然后同步去重（保持顺序，先加载的优先）
const fileIds = await Promise.all(
  allSkillsWithPaths.map(({ filePath }) => getFileIdentity(filePath))
)

const seenFileIds = new Map<string, SettingSource>()
for (let i = 0; i < allSkillsWithPaths.length; i++) {
  const fileId = fileIds[i]
  if (seenFileIds.has(fileId)) {
    logForDebugging(`Skipping duplicate skill '${skill.name}'`)
    continue
  }
  seenFileIds.set(fileId, skill.source)
  deduplicatedSkills.push(skill)
}

```

---

### 十五、架构总结

Skills 系统的设计体现了几个核心原则：

**声明式优先**：skill 的行为完全由 Markdown + YAML 描述，无需编写代码。`when_to_use` 字段让模型自主决定何时调用，`paths` 字段实现上下文感知。

**渐进式发现**：启动时加载静态 skills，运行时通过文件操作动态发现新 skills，条件 skills 在匹配文件被操作时才激活。三层发现机制让 skills 既高效又灵活。

**安全默认**：MCP skills 禁止 Shell 执行，权限系统默认 ask，新属性默认需要权限，文件写入使用 `O_EXCL | O_NOFOLLOW`。每个扩展点都有明确的安全边界。

**预算感知**：skill 列表占用上下文窗口的 1%，超出时优先保留 bundled skills 的完整描述，用户 skills 按比例截断。系统在功能性和 token 效率之间做了精细权衡。

**元编程能力**：`skillify` skill 让用户可以将任意工作流固化为可复用的 skill，形成正向飞轮——越用越强大。

---

### 十六、给 mini-claude-code 的启示

Skills 系统的核心思想——用 Markdown 文件描述可复用的 AI 工作流——可以用极少的代码实现：

```Python
// 代码块
# mini-claude-code 的极简 Skills 系统
# 对应 Claude Code 的 SkillTool + loadSkillsFromSkillsDir

import os, yaml
from pathlib import Path

def load_skills(project_root: str) -> dict[str, dict]:
    """
    扫描 .claude/skills/ 目录，加载所有 SKILL.md 文件。
    返回 {skill_name: {description, prompt, when_to_use}} 字典。
    """
    skills = {}
    skills_dir = Path(project_root) / ".claude" / "skills"

    if not skills_dir.exists():
        return skills

    for skill_dir in skills_dir.iterdir():
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        content = skill_file.read_text()

        # 解析 YAML frontmatter
        if content.startswith("---"):
            _, frontmatter, body = content.split("---", 2)
            meta = yaml.safe_load(frontmatter)
        else:
            meta, body = {}, content

        skills[skill_dir.name] = {
            "description": meta.get("description", ""),
            "when_to_use": meta.get("when_to_use", ""),
            "prompt": body.strip(),
        }

    return skills

def inject_skill_into_conversation(skill: dict, args: str = "") -> str:
    """将 skill 内容注入为用户消息（对应 Inline 执行模式）"""
    prompt = skill["prompt"]
    if args:
        prompt = prompt.replace("$ARGUMENTS", args)
    return prompt

```

**最值得从 Claude Code 借鉴的两个设计**：

第一，`**when_to_use 字段让模型自主决定调用时机**`。不需要用户记住所有斜杠命令，只需要在 SkillTool 的 prompt 里列出所有 skill 的 `when_to_use`，模型会在合适的时候自动调用。这是"声明式 AI 工作流"的核心思想。

第二，**安全属性白名单（SAFE_SKILL_PROPERTIES）**。新增 skill 属性时，默认需要用户确认（fail-safe），只有经过审查的属性才加入白名单。这个设计确保了 skill 系统的扩展不会悄悄引入安全风险。mini-claude-code 在实现 skill 权限时可以参考这个思路：不是列举危险属性，而是列举安全属性。

---

*下一篇：专题12——启动流程，深入 Claude Code 从进程启动到首屏渲染的完整链路，以及 earlyInput 和延迟预取如何消除启动卡顿。*
