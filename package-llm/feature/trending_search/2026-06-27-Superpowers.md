# 【2026-06-27】Superpowers - Agentic Skills Framework & 软件开发方法论研究报告

## Superpowers - Agentic Skills Framework & 软件开发方法论研究报告

### 项目基本信息

| 信息项 | 详情 |
| --- | --- |
| **项目名称** | Superpowers |
| **GitHub** | https://github.com/obra/superpowers |
| **官网** | https://primeradiant.com |
| **Star 数** | 239,495+ |
| **Fork 数** | 21,249+ |
| **主要语言** | Shell（核心为 Agent 指令文件） |
| **开源协议** | MIT |
| **最新版本** | v6.0.3（2026-06-18 发布） |
| **创建时间** | 2025-10-09 |
| **作者** | Jesse Vincent（Prime Radiant 团队） |

### 一、项目简介

Superpowers 是一个**完整的软件开发方法论**，专为 AI 编码 Agent 设计。它不是一个 Agent 框架，而是一套**可组合的技能集合（Skills）+ 初始指令**，让你的编码 Agent 自动遵循经过验证的工程实践。

核心理念：**你的 Agent 有了 Superpowers，就会自动做正确的事，你什么都不用额外配置。**

与其他 Agent 框架的区别：

- **不是 SDK/Framework**：没有运行时、没有 API、不需要代码集成。它是一组 Markdown 格式的 Skill 定义文件，Agent 自动识别并使用。
- **不是 LLM 调用层**：不封装 LLM 调用，而是指导 Agent **如何思考、如何规划、如何验证工作**。
- **跨 Agent 通用**：同一套 Skill 文件，同时支持 Claude Code、Cursor、Codex、Gemini CLI、GitHub Copilot CLI、OpenCode、Kimi Code、Pi、Factory Droid、Antigravity、OpenCode 等 11 种主流编码 Agent。

一句话总结：**Superpowers = 给 AI 编码 Agent 装一套"工程思维操作系统"。**

### 二、核心功能详解

#### 2.1 技能体系（Skills Library）

Superpowers 的核心是 14 个可组合的 Skill，每个 Skill 是一个 Markdown 文件，Agent 自动识别并在合适的时机触发。

##### 2.1.1 需求与设计阶段

**brainstorming（头脑风暴）**

- 在写代码之前，先问用户"你真正想做什么？"
- 通过苏格拉底式提问精炼需求
- 探索替代方案
- 以可阅读的章节形式展示设计方案，让用户逐段审核
- 保存设计文档

**writing-plans（编写计划）**

- 将批准的设计分解为 2-5 分钟的小任务
- 每个任务包含精确的**文件路径、完整代码、验证步骤**
- 计划足够清晰，一个"热情但品味差、没有判断力、没有项目上下文、且厌恶测试的初级工程师"也能照着做

##### 2.1.2 执行阶段

**subagent-driven-development（子Agent驱动开发）**

- 每个任务派发一个全新的子 Agent
- 两阶段审查：
  1. **规格合规审查**：子 Agent 的输出是否符合任务规格？
  2. **代码质量审查**：代码质量如何？
- 不常见的场景：Agent 可以自主工作数小时不偏离计划

**executing-plans（执行计划）**

- 批量执行任务，设置人工检查点
- 适合不需要子 Agent 的简单项目

**dispatching-parallel-agents（并行派发Agent）**

- 并发派发多个子 Agent 处理独立任务
- 适用于大规模重构或并行开发

##### 2.1.3 测试阶段

**test-driven-development（测试驱动开发）**

- 严格遵守 RED-GREEN-REFACTOR 循环：
  1. **RED**：写一个失败的测试
  2. **GREEN**：写最少的代码让测试通过
  3. **REFACTOR**：重构代码
- 删除在测试之前写的代码——**先有测试，再写实现**
- 包含测试反模式参考指南

##### 2.1.4 代码审查

**requesting-code-review（请求代码审查）**

- 任务之间自动审查代码
- 对照计划检查合规性
- 按严重程度报告问题（关键问题阻塞进度）

**receiving-code-review（接收代码审查反馈）**

- 处理审查反馈的流程

##### 2.1.5 分支管理

**using-git-worktrees（使用 Git Worktrees）**

- 设计批准后，创建隔离的工作区
- 在新分支上运行项目设置
- 验证干净的测试基线

**finishing-a-development-branch（完成开发分支）**

- 任务完成后验证测试
- 提供选项：合并/PR/保留/丢弃
- 清理 worktree

##### 2.1.6 调试

**systematic-debugging（系统化调试）**

- 4 阶段根因分析流程
- 包含：根因追踪、纵深防御、基于条件的等待技术

**verification-before-completion（完成前验证）**

- 确保问题确实被修复

##### 2.1.7 元技能

**writing-skills（编写技能）**

- 创建新的 Skill 的最佳实践指南
- 包含测试方法论

**using-superpowers（使用Superpowers）**

- 技能系统介绍

#### 2.2 标准工作流

Superpowers 定义了一个完整的 SDLC（软件开发生命周期）：

```
// 代码块
1. brainstorming → 需求澄清 + 设计文档
2. using-git-worktrees → 创建隔离工作区
3. writing-plans → 分解为可执行任务
4. subagent-driven-development → 子Agent逐任务执行
5. test-driven-development → TDD 保证质量
6. requesting-code-review → 自动代码审查
7. finishing-a-development-branch → 合并/PR
```

**关键特性**：

- 技能在**合适的时机自动触发**，用户无需手动指示
- 强制工作流而非建议——Agent 会在每个阶段检查相关 Skill
- 用户可以在任何阶段介入和纠正

#### 2.3 支持的编码 Agent

| Agent/Harness | 安装方式 |
| --- | --- |
| **Claude Code** | `/plugin install superpowers@claude-plugins-official` 或 Superpowers Marketplace |
| **Codex App** | 插件市场直接安装 |
| **Codex CLI** | `/plugins` → 搜索 Superpowers |
| **Cursor** | `/add-plugin superpowers` |
| **Gemini CLI** | `gemini extensions install https://github.com/obra/superpowers` |
| **GitHub Copilot CLI** | 注册 marketplace + 安装插件 |
| **Kimi Code** | `/plugins` → Marketplace → Superpowers |
| **OpenCode** | 在线获取安装说明 |
| **Pi** | `pi install git:github.com/obra/superpowers` |
| **Factory Droid** | `droid plugin marketplace add` + `droid plugin install` |
| **Antigravity** | `agy plugin install https://github.com/obra/superpowers` |
| **Claude Desktop** | 通过 MCP 安装 |

#### 2.4 哲学与原则

- **测试驱动开发**（TDD）：先写测试，始终如此
- **系统化而非临时**：流程优于猜测
- **复杂度降低**：简单性为首要目标
- **证据优于声明**：验证前不宣称成功
- **YAGNI**（You Aren't Gonna Need It）：不需要的就不要做
- **DRY**（Don't Repeat Yourself）：不要重复

### 三、使用方式

#### 3.1 安装（以 Claude Code 为例）

**方式一：官方 Marketplace**

```Shell
// 代码块
/plugin install superpowers@claude-plugins-official
```

**方式二：Superpowers Marketplace**

```Shell
// 代码块
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

#### 3.2 安装（以 Cursor 为例）

在 Cursor Agent 聊天中输入：

```
// 代码块
/add-plugin superpowers
```

或在插件市场搜索 "superpowers"。

#### 3.3 安装（以 Pi 为例）

```Shell
// 代码块
pi install git:github.com/obra/superpowers
```

#### 3.4 安装（以 Gemini CLI 为例）

```Shell
// 代码块
gemini extensions install https://github.com/obra/superpowers
gemini extensions update superpowers  # 更新
```

#### 3.5 使用流程

安装后，Agent 在会话启动时自动加载 Superpowers 技能。使用方式极其简单：

1. **开始对话**：告诉 Agent 你想做什么
2. **需求澄清**：Agent 自动调用 `brainstorming` 技能，问你问题来理解需求
3. **设计展示**：Agent 展示设计方案，你审核通过
4. **自动执行**：Agent 按 TDD + 子Agent 模式执行开发
5. **审查合并**：完成后自动审查并提议合并

**无需手动触发任何 Skill**——一切都是自动的。

#### 3.6 禁用遥测

```Shell
// 代码块
export SUPERPOWERS_DISABLE_TELEMETRY=true
```

### 四、技术架构

#### 4.1 架构概览

```
// 代码块
┌─────────────────────────────────────────┐
│            Superpowers                   │
│         Skills Framework                │
├─────────────────────────────────────────┤
│  skills/                                │
│  ├── brainstorming/                     │
│  ├── test-driven-development/           │
│  ├── subagent-driven-development/       │
│  ├── systematic-debugging/              │
│  ├── writing-plans/                     │
│  ├── executing-plans/                   │
│  ├── requesting-code-review/            │
│  ├── receiving-code-review/             │
│  ├── using-git-worktrees/               │
│  ├── finishing-a-development-branch/    │
│  ├── verification-before-completion/    │
│  ├── dispatching-parallel-agents/       │
│  ├── writing-skills/                    │
│  └── using-superpowers/                 │
├─────────────────────────────────────────┤
│  .claude/       .cursor/    .pi/         │
│  .antigravity/  .copilot/   .gemini/     │
│  .codex/        .droid/     .opencode/   │
│  .kimi/         .pi/        .claude-desktop/│
├─────────────────────────────────────────┤
│  evals/  tests/  docs/  LICENSE         │
└─────────────────────────────────────────┘
```

#### 4.2 技术特点

| 特点 | 说明 |
| --- | --- |
| **零运行时** | 纯 Markdown/Shell 文件，无代码执行 |
| **Agent 原生** | 利用 Agent 的上下文理解和指令遵循能力 |
| **自动触发** | Skill 文件包含触发条件，Agent 自动识别 |
| **跨 Agent** | 同一套 Skill 适配 11+ 种编码 Agent |
| **可组合** | 14 个 Skill 按 SDLC 阶段自动组合 |
| **可测试** | 有独立的 evals 测试框架 |

#### 4.3 与技能市场的关系

Superpowers 有一个**双重市场体系**：

1. **官方 Claude Marketplace** — Anthropic 官方认证
2. **Superpowers Marketplace** (`obra/superpowers-marketplace`) — 由 Prime Radiant 维护，包含 Superpowers 及更多相关插件

### 五、落地实践场景

#### 5.1 AI 原生软件开发

**场景**：团队使用 Claude Code / Cursor 进行日常开发，但 Agent 经常写出一堆未经测试的代码。

**方案**：安装 Superpowers 后，Agent 自动遵循 TDD、代码审查、分支管理等工程实践，代码质量显著提升。

**证据**：README 明确说"不常见的场景：Agent 可以自主工作数小时不偏离计划"——这是 Superpowers 的核心卖点。

#### 5.2 企业级 Agent 治理

**场景**：企业部署 AI 编码 Agent，但缺乏统一的工程标准。

**方案**：在组织内统一安装 Superpowers，所有 Agent 自动遵循相同的 TDD、代码审查、分支管理流程。

**价值**：

- 不需要培训每个开发者如何与 Agent 协作
- 不需要写复杂的项目规范文档
- Agent 自动执行最佳实践

#### 5.3 开源项目维护

**场景**：开源项目维护者希望 Agent 贡献的代码遵循项目规范。

**方案**：在 `.claude/` 目录安装 Superpowers，所有通过 Agent 提交的代码自动经过测试和审查。

#### 5.4 学习 AI 编码最佳实践

**场景**：开发者想了解 AI 编码 Agent 应该如何工作。

**方案**：研究 Superpowers 的 Skill 定义，学习 Agentic SDLC 的设计思路。

**价值**：Superpowers 的每个 Skill 都是实战验证过的 Agent 行为规范。

#### 5.5 构建自定义 Agent 技能

**场景**：团队有特定的工程实践需要 Agent 遵循。

**方案**：参考 `writing-skills` 技能创建自定义 Skill，定义团队专属的工程流程。

### 六、个人评价和建议

#### 优势

1. **⭐239K Stars**：这是 AI 开源项目中极其罕见的高星项目。说明社区对"AI Agent 工程方法论"这个方向有巨大需求。

1. **跨 Agent 通用性**：同一套 Skill 同时支持 11+ 种编码 Agent，这是目前独一无二的特性。其他项目要么绑定 Claude Code，要么绑定 Cursor。

1. **零侵入设计**：不需要代码集成、不需要 SDK、不需要 API 调用。纯 Markdown 文件，Agent 自己识别使用。

1. **工程方法论成熟**：TDD、系统化调试、Git Worktrees、代码审查、子Agent驱动开发——这些不是花哨的功能，而是经过验证的软件工程实践。

1. **自动触发机制**：Skill 在合适的时机自动触发，用户不需要手动指示。这解决了 Agent 工具调用的核心问题——"Agent 什么时候该做什么"。

1. **商业支持**：Prime Radiant 提供企业版商业支持，包括额外工具和管理支出。

#### 不足与风险

1. **依赖 Agent 能力**：效果高度依赖底层 Agent 的上下文理解和指令遵循能力。如果 Agent 能力不足，Skill 可能无法正确执行。

1. **Shell 为主**：主要语言是 Shell，核心逻辑是 Markdown 文件。对于复杂逻辑场景，可能不够灵活。

1. **285 个 Open Issues**：虽然活跃开发中，但 issue 数量不少，部分功能可能不够稳定。

1. **遥测**：默认有视觉遥测（加载 Prime Radiant logo），虽然不含项目信息，但部分企业可能不允许。

#### 与同类项目对比

| 维度 | Superpowers | SkillSpector | BuilderIO/agent-native | DeerFlow |
| --- | --- | --- | --- | --- |
| **定位** | Agent 工程方法论 | Agent 技能安全扫描 | Agent 原生应用框架 | Agent Harness |
| **核心能力** | SDLC 技能 + TDD | 安全漏洞扫描 | 应用构建 | 研究+编码+创作 |
| **安装方式** | 插件（11种Agent） | 插件 | SDK | SDK |
| **运行时** | 无（纯指令） | 无 | 有 | 有 |
| **Star** | ⭐239K | ⭐67K | ⭐74K | ⭐74K |
| **License** | MIT | MIT | Apache-2.0 | Apache-2.0 |

#### 建议

1. **对个人开发者**：如果你用 Claude Code / Cursor / Codex 等编码 Agent，强烈建议安装 Superpowers。它能显著提升 Agent 产出的代码质量。

1. **对企业/团队**：可以作为统一的 Agent 工程实践标准，在组织内统一安装。配合 SkillSpector（已研究过）做安全审查，形成完整的 Agent 开发治理体系。

1. **对 Agent 平台开发者**：Superpowers 的 Skill 自动触发机制值得深入研究。其核心设计是"Skill 文件包含触发条件描述，Agent 读取后自行判断何时使用"——这种基于自然语言的自动触发比硬编码的调度器更灵活。

1. **对美团内部**：Superpowers 的 Skill 体系设计理念（可组合、自动触发、跨 Agent 通用）对 Agent 平台的 Skill 注册和调度有参考价值。特别是 subagent-driven-development 的两阶段审查机制，可以在 Agent 编排中借鉴。

---

*研究日期：2026-06-27 | 数据来源：GitHub API、项目 README、源码分析*
