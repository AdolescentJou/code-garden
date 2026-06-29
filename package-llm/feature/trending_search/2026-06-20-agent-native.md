# 【2026-06-20】BuilderIO/agent-native - AI Agent原生应用框架研究报告

## BuilderIO/agent-native - AI Agent 原生应用框架研究报告

> 📅 研究日期：2026-06-20
> 🔗 GitHub：https://github.com/BuilderIO/agent-native
> ⭐ Stars：1,084（+147 today）| Forks：119
> 📜 License：MIT
> 💻 语言：TypeScript
> 📖 文档：https://agent-native.com
> 👥 Discord：https://discord.gg/qm82StQ2NC

---

### 一、项目简介

**Agent-Native** 是由知名前端框架团队 **BuilderIO** 开发的开源 Agent 原生应用框架。它解决的核心问题是：**如何把 AI Agent 从"聊天框旁边"拉到"应用内部"**。

传统方案要么是 SaaS 工具（UI 漂亮但 Agent 能力浅），要么是纯 Agent（能力强但没有 UI），要么是内部工具（代码可改但维护成本高）。Agent-Native 的答案是：**Agent 和 UI 是同一个系统的平等公民**——点击和对话做的事情完全一样，状态实时同步。

项目 2026 年 3 月 12 日创建，6 月初开始爆发，短时间内聚集 1,084 颗星，被 GitHub Trending 多次推荐。

---

### 二、核心功能详解

#### 2.1 统一 Actions 架构

Agent-Native 的核心抽象是 **Actions**——定义一次，处处可用：

```TypeScript
// 代码块
// 一个 Action 同时支持 UI、Agent、HTTP、MCP、A2A、CLI
export default defineAction({
  schema: z.object({
    emailId: z.string(),
    body: z.string(),
  }),
  run: async ({ emailId, body }) => {
    await db.insert(replies).values({ emailId, body });
  },
});
```

同一个 `defineAction` 可以被 UI 按钮调用、Agent 工具调用、HTTP API 调用、MCP 协议调用、A2A 协议调用、CLI 调用。这种"一次定义、多端复用"的思路大幅降低了 Agent 应用的开发和维护成本。

#### 2.2 Agent 与 UI 实时同步

这是项目的核心创新点：

- **共享状态和数据库**：Agent 和 UI 共享同一个 SQL 数据库和状态，任何一方的变更都会实时反映在另一方
- **实时多人协作**：人类和 Agent 可以在同一文档中同时协作，CRDT 合并、实时光标/选择指示、Agent 作为一等公民编辑者
- **上下文感知**：Agent 知道用户当前在看什么，选中文本后按 Cmd+I 即可让 Agent 操作选中内容
- **三种产品形态**：同一个 Agent 可以打包为无头 API、丰富的聊天体验、或完整的 SaaS 应用，底层复用同一套原语

#### 2.3 多协议原生支持

框架内置了对主流 Agent 协议的集成，而不是事后拼接：

| 协议 | 说明 |
| --- | --- |
| **MCP** | Model Context Protocol，标准远程 OAuth 集成 |
| **MCP Apps** | MCP 应用级协议 |
| **A2A** | Agent-to-Agent 协议，跨 Agent 调用 |
| **HTTP/CLI** | 标准 HTTP 请求和命令行调用 |
| **AgentChatRuntime** | 标准 OpenAI、AG-UI、Claude Agent SDK、Vercel AI SDK 适配器 |
| **Deep Links** | 深度链接 |

所有协议都挂载在同一个 Action 表面，不需要为每个协议单独做集成。

#### 2.4 完整的 Agent 运行时

框架内置的 Agent 运行时不只是简单的 chat loop，而是生产级的完整套件：

| 能力 | 说明 |
| --- | --- |
| **Chat** | 内置聊天运行时，支持流式响应 |
| **Tools** | 工具系统，Actions 即工具 |
| **Skills** | 技能系统，可扩展 Agent 能力 |
| **Memory** | 持久化记忆，SQL 后端 |
| **Jobs** | 异步任务调度 |
| **Observability** | 可观测性（日志、追踪） |
| **Handoffs** | Agent 间交接 |
| **Identity** | 用户身份管理 |

#### 2.5 编码 Agent 技能集成

可以直接给 Claude Code、Codex CLI、Cursor、Pi、OpenCode、GitHub Copilot 等编码 Agent 安装技能：

```Shell
// 代码块
# 安装 visual-plan 技能
npx @agent-native/core@latest skills add visual-plan
```

安装后获得两个 slash 命令：

- `**/visual-plan**`：Agent 写代码前先打开结构化计划文档（内联图表、UI 线框图、文件实现映射），用户可评论和审批
- `**/visual-recap**`：变更落地后，将 PR 或 git diff 转化为可视化回顾（schema/API/文件变更的 before/after 块 + 可分享审查链接）

#### 2.6 模板生态系统

提供 6 个完整的可克隆 SaaS 模板：

| 模板 | 对标产品 | 功能 |
| --- | --- | --- |
| **Calendar** | Google Calendar, Calendly | 事件管理、Google Calendar 同步、AI 调度 |
| **Content** | Obsidian for MDX | Markdown/MDX 编辑、Agent 辅助写作 |
| **Plans** | 编码 Agent 计划板 | `/visual-plan` + `/visual-recap` |
| **Slides** | Google Slides, Pitch | React 演示文稿生成和编辑 |
| **Analytics** | Amplitude, Mixpanel | 数据分析、图表、看板 |
| **Clips** | Loom | 录屏、自动字幕、Agent 摘要 |

每个模板都是完整的可克隆 SaaS 应用——fork 下来，用 Agent 自定义，完全拥有代码。

#### 2.7 多应用工作空间

支持 Monorepo 结构，多个应用共享认证和状态：

```
// 代码块
my-platform/
├── .env                           # 共享密钥
├── packages/shared/               # 共享代码
└── apps/
    ├── mail/
    ├── calendar/
    └── forms/
```

同一源部署意味着跨应用共享登录会话和零配置 A2A —— 从日历的 Agent 聊天中 @mail 就能调用邮件 Agent。

#### 2.8 后端无关设计

- **数据库**：任何 Drizzle 支持的 SQL 数据库
- **部署**：任何 Nitro 兼容的主机（含 Serverless）
- **LLM**：支持标准 OpenAI 格式，可接入任何模型提供商
- **无锁定**：不依赖特定云平台

---

### 三、使用方式

#### 3.1 快速开始

```Shell
// 代码块
# 创建项目（选择模板）
npx @agent-native/core@latest create my-platform

# 安装依赖
cd my-platform
pnpm install

# 启动开发服务器
pnpm dev
```

#### 3.2 单应用模式

```Shell
// 代码块
# 单个应用，非 Monorepo
npx @agent-native/core@latest create my-app --standalone --template mail
```

#### 3.3 连接外部编码 Agent

Agent-Native 提供 MCP 支持，可以将 Claude Code、Codex、Cursor、OpenCode、VS Code（GitHub Copilot）等编码 Agent 连接到托管的 Agent-Native 应用：

```Shell
// 代码块
# 安装技能到编码 Agent
npx @agent-native/core@latest skills add visual-plan
```

详细配置参考 [External Agents 指南](https://agent-native.com/docs/external-agents)。

#### 3.4 Agent Surface 选择

根据需求选择 Agent 呈现方式：

| 模式 | 适合场景 |
| --- | --- |
| **Headless** | 纯 API 调用、CLI 工具、MCP/A2A 集成 |
| **Rich Chat** | 独立聊天或嵌入式聊天（原生表格、图表、审批流） |
| **Whole App** | 完整 SaaS 产品，聊天从中心开始，可移到侧边栏，与 App 状态同步 |

#### 3.5 部署

```Shell
// 代码块
# 一键部署（同一源，所有应用共享登录）
npx @agent-native/core@latest deploy
# https://your-agents.com/mail/*       → mail app
# https://your-agents.com/calendar/*   → calendar app
# https://your-agents.com/forms/*      → forms app
```

#### 3.6 添加新应用

```Shell
// 代码块
npx @agent-native/core@latest add-app notes --template content
```

---

### 四、落地实践场景

#### 4.1 构建 Agent 原生 SaaS 产品

**场景**：创业团队希望快速构建一个带 AI 能力的 SaaS 产品。

**实践**：从模板（Calendar/Content/Analytics）fork 项目，用 Agent 自定义 UI 和业务逻辑，部署后即可上线。模板提供完整的前端+后端+认证+数据库，不需要从零搭建。

#### 4.2 内部工具智能化

**场景**：企业有大量内部工具，希望用 AI Agent 增强。

**实践**：基于 Agent-Native 的 Headless 模式，在现有工具之上叠加 Agent 能力。Actions 统一了 UI 和 Agent 的接口，不需要为 Agent 单独写一套 API。

#### 4.3 编码 Agent 增强

**场景**：使用 Claude Code 等编码 Agent，但希望 Agent 能更好地理解项目计划和变更。

**实践**：安装 `visual-plan` 技能，Agent 写代码前生成可视化计划文档，写完后生成可视化变更回顾。大幅提升代码评审效率。

#### 4.4 多 Agent 协作系统

**场景**：多个微服务各自有 Agent，需要跨服务协作。

**实践**：Agent-Native 的 A2A 协议支持跨 Agent 调用。在 Analytics App 的 Agent 中 @mail 可以触发邮件发送，在 Calendar App 的 Agent 中 @forms 可以创建表单。同一源部署零配置。

#### 4.5 人机协作编辑

**场景**：文档编辑场景需要人类和 AI 同时协作。

**实践**：Agent-Native 的 Content 模板提供 Obsidian 级别的 Markdown/MDX 编辑体验，支持 Agent 和人类在同一文档中 CRDT 合并编辑，实时显示光标和选择。

#### 4.6 演示文稿自动生成

**场景**：需要快速生成和编辑演示文稿。

**实践**：Slides 模板基于 React 构建，支持通过自然语言描述生成或编辑演示文稿，同时支持点击编辑。

---

### 五、个人评价与建议

#### 优势

1. **理念领先**："Agent 和 UI 是平等公民"这个理念非常超前。传统方案把 Agent 加在 UI 旁边（ChatGPT 模式），Agent-Native 把 Agent 嵌入到 UI 内部
2. **一次定义，多端复用**：`defineAction` 同时支持 UI、Agent、HTTP、MCP、A2A、CLI 六种调用方式，架构设计非常优雅
3. **模板生态**：6 个完整的 SaaS 模板大幅降低起步门槛，不是脚手架而是"可克隆的完整应用"
4. **多协议原生支持**：MCP、A2A、MCP Apps 等协议不是事后拼接，而是框架原生设计
5. **后端无关**：Drizzle + Nitro 的组合提供了极大的灵活性
6. **编码 Agent 集成**：`/visual-plan` 和 `/visual-recap` 技能对 AI 编码工作流是实质性增强
7. **BuilderIO 背书**：来自知名前端框架团队，代码质量和工程规范有保障

#### 不足与风险

1. **项目较新**：2026 年 3 月才创建，生态成熟度还需时间验证
2. **社区规模**：1,084 颗星、119 个 fork，社区还在早期阶段
3. **依赖特定技术栈**：虽然数据库和部署无关，但框架本身基于 React/TypeScript/Drizzle，对 Python/Go 团队有一定门槛
4. **MCP/A2A 生态仍在演进**：协议标准还在发展，框架需要持续跟进
5. **文档深度**：README 详细但官方文档网站内容还需完善

#### 建议

1. **强烈推荐关注**：Agent-Native 代表了 Agent 应用的下一个方向——Agent 不再是 UI 旁边的小助手，而是 UI 的一部分
2. **适合快速起步**：如果要做 Agent 原生产品，从模板 fork 是最快的路径
3. **编码 Agent 技能值得安装**：`visual-plan` 和 `visual-recap` 对日常编码工作流有实际价值
4. **关注 A2A 协议发展**：Agent-Native 对 A2A 的原生支持是差异化优势，随着 A2A 标准成熟，这个优势会越来越明显
5. **适合前端/全栈团队**：TypeScript + React + Drizzle 技术栈对前端团队友好

---

### 六、对比同类项目

| 维度 | Agent-Native | LangChain/LCEL | CrewAI | AutoGen |
| --- | --- | --- | --- | --- |
| 定位 | Agent 原生应用框架 | LLM 编排框架 | 多 Agent 编排 | 多 Agent 对话 |
| UI 支持 | ✅ 完整 UI 框架 | ❌ 无 | ❌ 无 | ❌ 无 |
| 协议支持 | MCP + A2A + MCP Apps | LangChain 协议 | 自定义 | 自定义 |
| 数据库 | SQL（Drizzle） | 无内置 | 无内置 | 无内置 |
| 部署 | 任意 Nitro 主机 | 任意 | 任意 | 任意 |
| 编码 Agent 集成 | ✅ 原生支持 | ❌ | ❌ | ❌ |
| 模板生态 | 6 个完整 SaaS 模板 | 无 | 无 | 无 |
| 实时协作 | CRDT 合并 | 无 | 无 | 无 |

---

*本报告基于 2026-06-20 GitHub Trending 数据及项目 README 自动生成*
