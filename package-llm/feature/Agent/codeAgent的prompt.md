# Prompt

## 项目搭建prompt

我要开发一个类似Claude code的AI coding工具，名叫mini claude code。我会给你提供mini claude code的产品架构、系统分层架构以及Agent core模块的设计，你需要帮我完成详细的项目技术方案以及项目架构，要求使用typescript编程语言相关技术栈、使用pnpm monorepo管理不同包，注意不需要各模块的详细实施方案。

### 产品架构

下图从4个层面解析mini claude code的产品能力，包括：

**用户交互**：支持四种交互形式，包括终端terminal、浏览器web、浏览器插件、桌面应用desktop

**用户会话**：用户通过与Agent对话来完成任务，用户输入指令，Agent会执行多步操作来完成任务，以下为与会话相关的功能：

- **版本回退**：用户每一次输入就是一个检查点，可以将代码和对话信息回退到任意一个检查点
- **会话切换**：用户可以开启多个会话并切换，不同会话的上下文互相隔离
- **多模态输入**：支持文本和图片输入
- **文件引用**：支持直接引用指定本地文件给Agent
- **后台任务**：用户可以把Agent当前正在执行的任务放置在后台，用户可继续与Agent交互

**Agent执行**：

- **执行模式切换**：包含Default、Auto-accept edits、Plan mode模式，其中Default模式下，Agent在文件编辑和 shell 命令前会询问用户，Auto-accept edits模式下，Agent不询问直接编辑文件，但会询问命令。Plan mode模式下，Claude 仅使用只读工具。
- **任务列表**：Agent能自主规划执行计划，拆解为多个子任务，并实时更新子任务完成情况。
- **文件读写**：Agent能自主读写文件
- **shell命令执行**：Agent能自主执行shell命令
- **Skills、MCP、Rules、SubAgents**：这四个模块都用于扩展Agent的能力

**应用扩展配置**：用户可通过各类配置来扩展Agent的能力，包括：

- **模型切换**：接入不同厂商的不同模型
- **hook**：在Agent执行的各个生命周期执行用户自定义的确定性脚本
- **Skills、MCP、Rules、SubAgents**：Agent扩展配置

### 系统分层架构

整体分为四层：

#### 交互层

- 终端
- 桌面应用
- web应用
- 浏览器插件

#### 接入层

- **SDK**：通过SDK提供的api接口来直接使用Agent
- **http server**：本地起一个http服务，通过http接口来使用Agent

#### 核心逻辑层

- **Agent core**：Agent核心逻辑
- **会话管理**：管理用户与Agent的会话
- **配置系统**：为应用扩展提供配置能力，包括Skills、MCP、Rules、SubAgents等

#### 基础设施

- **日志系统**：为Agent应用提供可视化的日志系统，包括日志记录与查询。需要为对话上下文、token消耗数、Agent任务执行时长、tool调用、skills调用、subagents调用等模块提供格式化的日志记录和查询手段
- **Agent测试**：提供可视化的Agent测评系统，包括测试用例建设、测试过程可视化，测试结果评估与对比等功能
- **数据访问**：为会话数据、日志系统、配置系统提供数据存储访问能力

> 注意：除业务逻辑层一个包，其余层各个模块单独为一个包。

### Agent Core 模块

核心包含4个模块：

1. **BaseAgent**：基础Agent，负责调度各个模块完成LLM输入的拼装，并将LLM返回的结果暴露出去
2. **Tools**：Agent使用的工具列表
3. **Memory**：管理输入给模型的message列表
4. **LLM**：LLM模型调用

此外需要其它模块扩展Agent能力，包括：

- **MiniClaudeCodeAgent**：应用的主Agent，默认持有MCP注入以及使用skills、文件读写、shell命令执行、todo管理、子Agent执行工具，有自己独特的系统提示词
- **ContextManage**：管理Agent的上下文，并转换为Memory，支持上下文压缩、清除和注入
- **MCP**：外部服务注入的扩展工具列表
- **Skills**：按需注入上下文，由Agent通过tools控制
- **Rule**：按条件注入上下文，由ContextManage控制
- **SubAgents**：由Agent通过tools调用子Agent，可并行调用
- **文件读写**：由Agent通过tools控制
- **shell命令执行**：由Agent通过tools控制
- **todo管理**：由Agent通过tools控制
- **权限控制**：当触发shell命令执行和文件读写工具调用时，需要用户确认是否允许

---

## LLM和Memory模块

现在开始开发llm和memory模块：

- **llm模块**基于AI SDK封装，其功能是使用其 `streamText` API实现模型调用（`import { streamText } from 'ai'`），支持配置模型、打断模型输出，并将模型返回的不同message part暴露为不同的message update事件。
- **memory**存储消息的基本单位是message，其定义参照AI SDK中的message，memory模块可监听message update事件，更新对应的message并存储。

---

## Agent模块

现在开始开发Base Agent和MiniClaudeCodeAgent：

- 每实例化一个Agent需要一个 `sessionId`，Agent需要基于sessionId查找历史的系统提示词、memory、llm和tool，没有sessionId或没有查找到对应模块，则初始化新的
- Agent有一个 `run` 方法，接收一个prompt去调用llm，并返回结果
- **MiniClaudeCodeAgent** 继承自Agent，重写 `run` 方法，如果llm返回的是工具调用，则自动调用工具，拿到结果后使用message update事件更新memory，并再次执行run方法

> 单独用一个system prompt目录，存储Base Agent和MiniClaudeCodeAgent的提示词。

此外，tool目录下，参照下方代码编写读文件工具作为MiniClaudeCodeAgent的默认工具。

### 开发记录

开发时遇到一些问题，这里记录一下：

1. 代码里对输入给模型的tool相关的消息的格式不对，原因是官方文档里streamText api的介绍里，对message格式的详细介绍在另一块地方，并且和streamText介绍的内容有点差异，导致AI混淆

### ReadTool 参考实现

```typescript
import z from "zod"
import * as fs from "fs"
import * as path from "path"
import { Tool } from "./tool"
import { LSP } from "../lsp"
import { FileTime } from "../file/time"
import DESCRIPTION from "./read.txt"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import { assertExternalDirectory } from "./external-directory"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_BYTES = 50 * 1024

export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce.number().describe("The line number to start reading from (0-based)").optional(),
    limit: z.coerce.number().describe("The number of lines to read (defaults to 2000)").optional(),
  }),
  async execute(params, ctx) {
    let filepath = params.filePath
    if (!path.isAbsolute(filepath)) {
      filepath = path.join(process.cwd(), filepath)
    }
    const title = path.relative(Instance.worktree, filepath)

    await assertExternalDirectory(ctx, filepath, {
      bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
    })

    await ctx.ask({
      permission: "read",
      patterns: [filepath],
      always: ["*"],
      metadata: {},
    })

    const file = Bun.file(filepath)
    if (!(await file.exists())) {
      const dir = path.dirname(filepath)
      const base = path.basename(filepath)

      const dirEntries = fs.readdirSync(dir)
      const suggestions = dirEntries
        .filter(
          (entry) =>
            entry.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(entry.toLowerCase()),
        )
        .map((entry) => path.join(dir, entry))
        .slice(0, 3)

      if (suggestions.length > 0) {
        throw new Error(`File not found: ${filepath}\n\nDid you mean one of these?\n${suggestions.join("\n")}`)
      }

      throw new Error(`File not found: ${filepath}`)
    }

    const isImage =
      file.type.startsWith("image/") && file.type !== "image/svg+xml" && file.type !== "image/vnd.fastbidsheet"
    const isPdf = file.type === "application/pdf"
    if (isImage || isPdf) {
      const mime = file.type
      const msg = `${isImage ? "Image" : "PDF"} read successfully`
      return {
        title,
        output: msg,
        metadata: {
          preview: msg,
          truncated: false,
        },
        attachments: [
          {
            id: Identifier.ascending("part"),
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: "file",
            mime,
            url: `data:${mime};base64,${Buffer.from(await file.bytes()).toString("base64")}`,
          },
        ],
      }
    }

    const isBinary = await isBinaryFile(filepath, file)
    if (isBinary) throw new Error(`Cannot read binary file: ${filepath}`)

    const limit = params.limit ?? DEFAULT_READ_LIMIT
    const offset = params.offset || 0
    const lines = await file.text().then((text) => text.split("\n"))

    const raw: string[] = []
    let bytes = 0
    let truncatedByBytes = false
    for (let i = offset; i < Math.min(lines.length, offset + limit); i++) {
      const line = lines[i].length > MAX_LINE_LENGTH ? lines[i].substring(0, MAX_LINE_LENGTH) + "..." : lines[i]
      const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0)
      if (bytes + size > MAX_BYTES) {
        truncatedByBytes = true
        break
      }
      raw.push(line)
      bytes += size
    }

    const content = raw.map((line, index) => {
      return `${(index + offset + 1).toString().padStart(5, "0")}| ${line}`
    })
    const preview = raw.slice(0, 20).join("\n")

    let output = "<file>\n"
    output += content.join("\n")

    const totalLines = lines.length
    const lastReadLine = offset + raw.length
    const hasMoreLines = totalLines > lastReadLine
    const truncated = hasMoreLines || truncatedByBytes

    if (truncatedByBytes) {
      output += `\n\n(Output truncated at ${MAX_BYTES} bytes. Use 'offset' parameter to read beyond line ${lastReadLine})`
    } else if (hasMoreLines) {
      output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`
    } else {
      output += `\n\n(End of file - total ${totalLines} lines)`
    }
    output += "\n</file>"

    LSP.touchFile(filepath, false)
    FileTime.read(ctx.sessionID, filepath)

    return {
      title,
      output,
      metadata: {
        preview,
        truncated,
      },
    }
  },
})

async function isBinaryFile(filepath: string, file: Bun.BunFile): Promise<boolean> {
  const ext = path.extname(filepath).toLowerCase()
  switch (ext) {
    case ".zip": case ".tar": case ".gz": case ".exe": case ".dll":
    case ".so": case ".class": case ".jar": case ".war": case ".7z":
    case ".doc": case ".docx": case ".xls": case ".xlsx": case ".ppt":
    case ".pptx": case ".odt": case ".ods": case ".odp": case ".bin":
    case ".dat": case ".obj": case ".o": case ".a": case ".lib":
    case ".wasm": case ".pyc": case ".pyo":
      return true
    default:
      break
  }

  const stat = await file.stat()
  const fileSize = stat.size
  if (fileSize === 0) return false

  const bufferSize = Math.min(4096, fileSize)
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength === 0) return false
  const bytes = new Uint8Array(buffer.slice(0, bufferSize))

  let nonPrintableCount = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true
    if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) {
      nonPrintableCount++
    }
  }
  return nonPrintableCount / bytes.length > 0.3
}
```

---

## MCP

现在开发MCP客户端，初始化Agent实例时，需要根据用户配置的mcp server信息收集工具，与本地工具合并。MCP client开发可以使用 `@modelcontextprotocol/sdk` 包。

> 相关文档libraryId为 `/modelcontextprotocol/docs`
>
> `@modelcontextprotocol/sdk` 包的文档无法直接通过包名引用，所以直接去 https://context7.com 站点搜索对应的文档，让AI通过libraryId来去查询

---

## Skills

开发skill tool，用于Agent在需要时加载使用，Agent可以看到所有技能名以及技能描述，并在需要时调用工具加载指定技能的详细内容。

一个技能就是一个文件目录，至少包含一个 `SKILL.md` 文件，包含两部分：

1. **YAML 前置部分**（位于 `---` 标记之间），用于告诉Agent技能名是什么以及何时使用该技能
2. **剩余部分**为技能的详细内容

该目录下还可存放其它任意类型文件，如图片、可执行文件等，技能的详细内容里会描述如何使用这些文件。

**示例：**

```yaml
---
name: explain-code
description: Explains code with visual diagrams and analogies. Use when explaining how code works, teaching about a codebase, or when the user asks "how does this work?"
---

When explaining code, always include:

1. **Start with an analogy**: Compare the code to something from everyday life
2. **Draw a diagram**: Use ASCII art to show the flow, structure, or relationships
3. **Walk through the code**: Explain step-by-step what happens
4. **Highlight a gotcha**: What's a common mistake or misconception?

Keep explanations conversational. For complex concepts, use multiple analogies.
```

> 注意：可用技能放在 `~/.claude/skills` 目录下，比如某个技能SKILL.md路径为 `~/.claude/skills/<skill-name>/SKILL.md`

---

## 写文件、Shell命令执行、Todo管理

现在继续开发tool，为MCC Agent提供写文件、shell命令执行、记todo以及读todo的能力。

### bash

开发bash tool，用以Agent执行git、npm、python等终端操作，注意考虑macOS、windows、linux不同平台的兼容性。

### write

开发write tool，用以Agent给指定目录文件写入内容。

### writeTodo

开发writeTodo tool，用以Agent将todo写入本地指定路径文件：`~/.mini-claude-code/todo/<session-id>`

### readTodo

开发readTodo tool，用以Agent读取待办事项。

---

## 上下文压缩

继续开发Memory模块，支持对Agent的上下文进行压缩，有2种策略：

### 压缩

保留最近几段对话，其余对话通过开发一个Compact Agent进行压缩，输出是压缩后的结构化摘要信息，将其拼在messages开头。

### 清除

保留最近几段对话，其余对话直接清除。

---

## 会话管理

开发会话管理模块。每个会话有一个唯一的 `sessionId`，关联Memory和ChatMessage：

- **Memory** 是发送给模型的上下文信息
- **ChatMessage** 是用户发送和看到的信息

会话管理模块需要将用户输入转化为message，并把message转化为给用户看的ChatMessage。目前有如下几条规则：

1. `text` 类型不做任何处理
2. `tool-call` 类型：
   - read和write tool需要保留工具名和处理的文件path
   - bash-tool保留工具名和入参
   - skill-tool需要保留工具名和查询的技能名
   - 其它tool只保留工具名
3. tool的结果只保留是否失败和成功

会话管理模块还具备如下功能：

1. **会话切换**：用户可以开启多个会话并切换，不同会话的上下文互相隔离
2. **多模态输入**：支持文本和图片输入
3. **文件引用**：支持直接引用指定本地文件作为用户输入

---

## 日志系统

日志系统专为Agent应用设计，日志与用户每个对话关联，即sessionId关联，目的是将整个对话过程和Agent的任务执行过程中的关键信息结构化地存储，便于可视化查看。

将整个执行过程划分为如下几个关键生命周期：

1. Agent初始化
2. 用户输入
3. LLM调用
4. LLM返回
5. 回到LLM调用或用户输入

日志系统需要提供日志记录方法，记录这几个关键生命周期的信息，并且记录在这几个生命周期之间打印的所有日志。

---

## 数据访存

整个应用有一个全局的存储空间，在 `~/.mini-claude-code` 目录，所有数据都存储在该目录下。

涉及到如下几种数据：

### 会话数据

- **元信息**：会话名、会话id、创建时间和更新时间
- **访问**：
  1. 获取所有会话列表
  2. 获取指定sessionId的详细会话数据，包括message和chatMessage等
- **存储**：
  1. 存储会话元信息
  2. 存储会话详细数据（一个json文件）

### Skills配置数据

- **元信息**：技能名、技能描述以及技能所处的目录
- **访问**：获取所有技能元信息
- **存储**：
  1. 存储技能元信息
  2. 技能详细信息（即一个技能原始目录，包含多个文件）

### MCP配置数据

一个json对象。

### SubAgents配置数据

- **元信息**：agent名、agent描述
- **访问**：
  1. 获取所有subAgent元数据
  2. 获取指定subAgent的详细信息
- **存储**：
  1. 存储subAgent元信息
  2. 存储subAgent的详细信息（一个json文件）

### 日志信息

- **元信息**：会话名、会话id、创建时间和更新时间
- **访问**：
  1. 获取所有日志列表
  2. 获取指定日志的详细日志数据
- **存储**：
  1. 存储日志元信息
  2. 存储日志详细信息（一个json文件）

---

## SDK

提供统一的API供其它应用使用Agent，包括如下接口：

### 会话管理

1. 查看会话列表
2. 新建会话
3. 在指定会话发送消息：接收一个回调函数，message的每次更新都会调用回调函数
4. 暂停指定会话回复

---

## 桌面端

基于electron开发桌面端应用，包含如下页面：

### 会话管理页

1. 查看会话列表
2. 新建会话
3. 在指定会话发送消息：持续渲染返回的数据
4. 暂停指定会话回复

> 具体能力通过SDK提供的API实现

---

## Server

利用SDK，提供如下接口：

### 会话管理

1. 查看会话列表
2. 新建会话
3. 在指定会话发送消息：和客户端建立SSE连接，持续返回数据
4. 暂停指定会话回复

---

## Webapp

开发web应用，包含：

### 会话页面

1. 查看会话列表
2. 新建会话
3. 在指定会话发送消息：和服务端建立SSE连接，持续接收数据
4. 暂停指定会话回复

---

## 优化Agent、Memory和Session的交互逻辑

初始化session对象时会初始化memory实例，该实例会在agent初始化时传入。Agent运行时，会动态更新memory实例中的messages。

messages更新时会向session对象抛出事件，session对象需要监听事件做出处理，比如转化为chatMessage等。messages更新时抛出的事件包括：

- **新增message**
- **更新message**

message类型有 `'user' | 'assistant' | 'tool'`，其中只有assistant消息会触发更新message（因为assistant消息是调用模型接口流式返回的）。

> 同时，session对象需要把messages更新时抛出的事件再抛给外部，供外部其它逻辑使用。
