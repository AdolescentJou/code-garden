# 【2026-06-25】Hermes Agent - 自进化AI Agent框架研究报告



# Hermes Agent - 自进化AI Agent框架研究报告

> **项目地址**：https://github.com/NousResearch/hermes-agent
> **Stars**：202k+ | **Forks**：36.1k | **License**：MIT
> **版本**：v0.17.0 (2026.6.19) | **语言**：Python 82.4%, TypeScript 13.6%
> **开发团队**：Nous Research

---

## 一、项目简介

Hermes Agent 是由 Nous Research（以开源大模型 Hermes 系列闻名的 AI 研究机构）开发的**自进化 AI Agent 框架**。它不是又一个编排框架或 SDK——它是一个完整运行的个人 AI Agent，具备从 CLI、桌面应用到消息平台（Telegram、Discord、Slack、WhatsApp、Signal 等 20+ 平台）的**全通道运行能力**。

核心卖点："**The self-improving AI agent**"——唯一内置闭环学习循环的 Agent：它从经验中创建技能、使用中改进技能、定期自我提醒持久化知识、搜索自身历史对话、跨会话构建用户画像。

值得注意的是，Hermes Agent 与我们使用的 OpenClaw 有明确的演进关系——项目内置了 `hermes claw migrate` 命令，可以从 OpenClaw 一键迁移设置、记忆、技能和 API 密钥。

---

## 二、核心功能详解

### 2.1 闭环学习系统（Closed Learning Loop）

这是 Hermes Agent 最核心的差异化能力：

- **自主技能创建**：完成复杂任务后，Agent 自动将解题经验提炼为可复用的技能（Skill），存入 `~/.hermes/skills/`，遵循 agentskills.io 开放标准
- **技能自我改进**：技能在后续使用中被 Agent 审视和优化，不是写完就固定
- **定期知识持久化**：Agent 会通过 cron 机制自动"提醒"自己将重要信息写入记忆文件
- **跨会话历史搜索**：基于 FTS5 全文搜索引擎，可以搜索过去所有对话，并用 LLM 对搜索结果做摘要
- **用户建模**：集成 Honcho 辩证式用户建模，跨会话逐步深化对用户偏好的理解

### 2.2 全通道消息网关（Messaging Gateway）

单一 gateway 进程同时桥接所有平台：

| 平台类别 | 支持的平台 |
|---------|-----------|
| 即时通讯 | Telegram、Discord、Slack、WhatsApp、Signal、Matrix、Mattermost |
| 企业通讯 | 飞书、钉钉、企业微信、QQ Bot |
| 其他 | Email、SMS、Home Assistant、Webhook、API Server |
| 社交 | Yuanbao、BlueBubbles |

关键特性：
- **语音消息转录**：收到语音备忘录自动转文字
- **跨平台会话连续性**：从 Telegram 开始的对话，可以在 Discord 继续同一个上下文
- **线程级交付**：cron 任务结果可以投递到特定平台的线程中

### 2.3 终端和浏览器控制

- **6 种终端后端**：local、Docker、SSH、Singularity、Modal、Daytona
  - Modal 和 Daytona 提供 serverless 持久化——空闲时环境休眠，有请求时唤醒，几乎零成本
- **浏览器自动化**：集成 agent-browser，支持 CDP 直接控制 Chromium
- **Computer Use**：跨平台 CUA 驱动（macOS/Windows/Linux），AT-SPI 无障碍树 + Wayland/X11 输入 + 截图

### 2.4 技能系统（Skills System）

Hermes 拥有业内最丰富的内置技能库，按领域组织：

| 目录 | 领域 |
|------|------|
| apple/ | macOS/iOS 生态集成 |
| autonomous-ai-agents/ | 自主 Agent 编排 |
| computer-use/ | 桌面控制 |
| creative/ | 创意生成 |
| data-science/ | 数据科学 |
| dogfood/ | 自我改进/内省 |
| email/ | 邮件处理 |
| github/ | GitHub 操作 |
| media/ | 媒体处理（含 YouTube 字幕） |
| mlops/ | MLOps |
| note-taking/ | 笔记管理 |
| productivity/ | 生产力工具 |
| research/ | 研究辅助 |
| smart-home/ | 智能家居 |
| social-media/ | 社交媒体 |
| software-development/ | 软件开发 |

还有 `optional-skills/` 目录存放更重/更小众的技能（如红队测试技能）。

### 2.5 定时任务（Cron Scheduling）

- 内置 cron 调度器，支持自然语言定义任务
- 任务结果可投递到任意平台（Telegram 线程、Discord 频道等）
- 支持可续投递（continuable delivery）：cron 任务执行完后可在平台线程中继续对话
- 适用场景：每日报告、夜间备份、周期审计

### 2.6 子 Agent 委托与并行化

- 可派生隔离的子 Agent 并行处理多个工作流
- 支持编写 Python 脚本通过 RPC 调用工具，将多步流水线压缩为零上下文成本的轮次
- 最大迭代次数默认 90 次（共享于子 Agent）

### 2.7 多模型支持

支持几乎所有主流 LLM 提供商：
- **Nous Portal**（自家，300+ 模型 + Tool Gateway 一键开通）
- OpenRouter（200+ 模型）、OpenAI、Anthropic、Hugging Face
- NovitaAI、NVIDIA NIM、小米 MiMo、z.ai/GLM、Kimi/Moonshot、MiniMax
- 自定义 endpoint

切换模型只需 `/model provider:model`，零代码改动。

### 2.8 MCP 集成

- 内置 MCP 客户端，可连接任意 MCP Server
- 官方 MCP 目录（`optional-mcps/`）：Linear、n8n、Unreal Engine 5.8
- 社区贡献：computer-use-linux（Linux 桌面控制 MCP）、HermesClaw（微信桥接）

### 2.9 安全机制

- **命令审批**：危险操作需用户确认，支持 `--yolo` 标志绕过所有审批
- **DM 配对**：消息平台仅响应已配对用户
- **容器隔离**：Docker/Singularity 后端提供环境隔离
- **作用域管理**：managed scope 在独立配置加载器中生效

### 2.10 研究用途

- **批量轨迹生成**：`batch_runner.py` 支持并行批量处理
- **轨迹压缩**：`trajectory_compressor.py` 用于训练下一代工具调用模型的轨迹压缩

---

## 三、使用方式

### 3.1 安装

**Linux / macOS / WSL2 / Termux**：
```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

**Windows（原生 PowerShell）**：
```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

安装器自动处理：uv、Python 3.11、Node.js、ripgrep、ffmpeg、便携式 Git Bash（MinGit）。

### 3.2 快速开始

```bash
source ~/.bashrc    # 重新加载 shell
hermes              # 启动交互式 CLI
hermes model        # 选择 LLM 提供商和模型
hermes tools        # 配置启用的工具
hermes setup        # 运行完整设置向导
```

### 3.3 使用 Nous Portal（一键配置）

```bash
hermes setup --portal   # OAuth 登录 → 设置 Nous 为提供商 → 开启 Tool Gateway
hermes portal info      # 查看已连接的工具
```

Nous Portal 一个订阅覆盖模型、网页搜索（Firecrawl）、图片生成（FAL）、TTS（OpenAI）、云浏览器（Browser Use），无需收集多个 API Key。

### 3.4 消息平台网关

```bash
hermes gateway setup    # 配置消息平台（Telegram Bot Token 等）
hermes gateway start    # 启动网关进程
# 然后在 Telegram/Discord/Slack 中给 Bot 发消息即可
```

### 3.5 从 OpenClaw 迁移

```bash
hermes claw migrate              # 交互式迁移（完整预设）
hermes claw migrate --dry-run    # 预览将迁移的内容
hermes claw migrate --preset user-data   # 仅迁移用户数据，不迁移密钥
hermes claw migrate --overwrite  # 覆盖已有冲突
```

迁移内容：SOUL.md、MEMORY.md、USER.md、技能、命令白名单、消息设置、API 密钥、TTS 资产、工作区指令。

### 3.6 常用命令速查

| 操作 | CLI | 消息平台 |
|------|-----|---------|
| 开始对话 | `hermes` | `hermes gateway start` 后发消息 |
| 新建会话 | `/new` 或 `/reset` | `/new` 或 `/reset` |
| 切换模型 | `/model provider:model` | `/model provider:model` |
| 设置人格 | `/personality name` | `/personality name` |
| 重试/撤销 | `/retry`、`/undo` | `/retry`、`/undo` |
| 压缩上下文 | `/compress` | `/compress` |
| 查看技能 | `/skills` | `/<skill-name>` |
| 中断当前工作 | `Ctrl+C` | `/stop` |

### 3.7 Docker 部署

```bash
docker compose up -d   # 使用官方 docker-compose.yml
```

支持 Windows Docker Desktop、s6-overlay 进程管理、supervised gateway 自动接管。

---

## 四、落地实践场景

### 4.1 个人 AI 助理

最适合的场景。Hermes 的设计哲学就是"个人 Agent"——它了解你、记住你、跨平台跟随你。从 CLI 写代码，从 Telegram 查日程，从 Discord 收通知，同一个 Agent、同一份记忆。

### 4.2 自动化运维与定时报告

利用 cron 系统，可以设定：
- 每日凌晨自动拉取服务器监控数据，生成报告推送到 Slack
- 每周审计代码仓库安全，结果投递到 Discord 线程
- 定时备份数据库，失败时自动告警

### 4.3 研究与数据采集

- 多步网页研究（WebResearchEnv RL 环境）
- 批量轨迹生成用于模型训练
- 跨会话知识积累和检索

### 4.4 多 Agent 协作

- 子 Agent 并行处理独立任务
- Kanban 看板插件（`plugins/kanban/`）支持多 Agent 协调
- RPC 脚本将多步流水线压缩为单次调用

### 4.5 企业消息平台集成

- 钉钉/飞书/企业微信原生支持
- 群聊场景下的 DM 配对安全机制
- 多用户隔离（profile 系统）

### 4.6 低成本云端 Agent

利用 Modal/Daytona serverless 后端：
- Agent 环境空闲时休眠，有消息时唤醒
- 5 美元/月的 VPS 即可运行
- 适合不需要 7x24 在线但需要持久环境的场景

---

## 五、个人评价和建议

### 5.1 优势

1. **自进化能力是真正的差异化**：市面上 Agent 框架多是编排工具，Hermes 是少数真正实现了"用得越多越懂你"的闭环学习系统的项目。技能自我改进 + 跨会话记忆搜索 + 用户画像建模，三者缺一不可。

2. **工程成熟度极高**：202k stars、1,544 贡献者、12,834 commits、~17k 测试用例、18 个正式版本——这不是 PoC，是生产级项目。

3. **全通道覆盖**：一个 gateway 进程桥接 20+ 平台（含国内主流企业通讯），这比大多数只支持 CLI 或只支持 Telegram 的 Agent 框架实用得多。

4. **安全设计周全**：命令审批、DM 配对、容器隔离、作用域管理——不是事后补丁，是一等公民。

5. **OpenClaw 迁移路径**：直接内置迁移命令，说明团队对现有用户生态有清晰的承接策略。

6. **"核心窄腰"架构哲学**：AGENTS.md 中明确阐述的 Footprint Ladder（能力扩展决策阶梯）是优秀的设计文档，新能力优先通过 skill/plugin/MCP 添加而非扩充核心工具集，保持了长期的可持续性。

### 5.2 不足与风险

1. **与 OpenClaw 的定位重叠**：Hermes Agent 本质上是 OpenClaw 的竞争/进化版本。对于已经在使用 OpenClaw 的团队，迁移成本和生态锁定是真实顾虑。

2. **复杂度偏高**：单 `run_agent.py` 约 12k LOC，`cli.py` 约 11k LOC——虽然团队在积极拆分，但核心文件仍然偏重，新贡献者上手门槛不低。

3. **模型工具的 prompt caching 约束**：AGENTS.md 明确指出"per-conversation prompt caching is sacred"——这限制了运行时动态切换工具集的能力，某些高级编排场景可能受限。

4. **社区质量参差**：1,544 贡献者意味着大量 PR 需要严格把关，AGENTS.md 中大段的"what we don't want"就是被低质量贡献逼出来的。

### 5.3 建议

1. **作为 OpenClaw 的对标和灵感源**：Hermes 的技能自改进、跨会话搜索、用户建模、Footprint Ladder 架构哲学等，都是值得借鉴的设计。特别是技能自我改进的闭环——当前 OpenClaw 的 skill 是静态的，没有"用后改进"机制。

2. **关注其 cron 和消息网关实现**：Hermes 的 cron 可续投递（continuable delivery）和线程级交付是很好的参考，可以思考如何增强我们的定时任务能力。

3. **谨慎评估迁移**：虽然内置了迁移命令，但两个项目的核心架构差异不小。建议先在独立环境试用 Hermes，评估其记忆和技能系统是否真正优于当前方案，再决定是否迁移。

4. **学习其社区治理**：AGENTS.md 中的贡献分级制度（Footprint Ladder）和自动化 PR 分类是很好的开源项目治理实践，值得参考。

---

*报告日期：2026-06-25*
*数据来源：GitHub Repository、README.md、AGENTS.md*
