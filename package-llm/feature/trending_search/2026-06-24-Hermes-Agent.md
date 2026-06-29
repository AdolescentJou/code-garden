# 【2026-06-24】Hermes Agent - 自进化AI Agent框架研究报告

## NousResearch/hermes-agent - 自进化AI Agent框架研究报告

> 研究日期：2026-06-24 | GitHub: https://github.com/NousResearch/hermes-agent | ⭐ 201k Stars

### 一、项目简介

**hermes-agent** 是由 **Nous Research** 开发的自进化AI Agent框架，slogan 是 "The agent that grows with you"——一个随着使用不断成长的 Agent。

与市面上大多数 Agent 框架不同，Hermes 的核心差异点在于 **内置学习闭环（closed learning loop）**：

- Agent 从复杂任务中**自主创建技能（Skills）**，下次直接复用
- 技能在使用中**自我改进**（self-improve during use）
- Agent **主动持久化知识**（nudge itself to persist knowledge），而不是被动记忆
- **跨会话搜索历史对话**（FTS5 session search + LLM summarization）
- **用户建模**（Honcho dialectic user modeling）——随着交互深入，Agent 对"你是谁"理解越来越深

项目 201k stars，12,677 commits，极其活跃，是目前 GitHub 上最热门的开源 Agent 框架之一。

### 二、核心功能详解

#### 2.1 自进化学习闭环（核心杀手锏）

这是 Hermes 最大的差异化能力，形成 **经验 → 技能 → 改进 → 更好经验** 的正反馈循环：

| 环节 | 机制 |
| --- | --- |
| **技能自动创建** | 完成复杂任务后，Agent 自动将解决方案提炼为可复用的 Skill |
| **技能自改进** | Skill 在后续使用中根据效果自动优化（类似 code self-healing） |
| **知识主动持久化** | Agent 不等你"记住这个"，而是自己判断什么值得记住并主动写入 |
| **跨会话检索** | FTS5 全文搜索 + LLM 摘要，能搜索自己过去所有对话 |
| **用户建模** | Honcho 辩证用户模型，理解你的偏好、习惯、工作方式 |

这套闭环意味着 **Hermes 用得越久越强**，不像传统 Agent 每次对话都从零开始。

#### 2.2 多平台消息网关

一个 `hermes gateway` 进程同时服务所有平台：

- **Telegram、Discord、Slack、WhatsApp、Signal、Email**
- 语音备忘录转录
- 跨平台对话连续性（在 Telegram 开始的对话，CLI 中继续）
- 定时任务自动投递到任意平台

#### 2.3 真正的终端界面

不是简单的 REPL，而是完整的 TUI：

- 多行编辑
- Slash 命令自动补全
- 对话历史浏览
- 中断-重定向（Ctrl+C 打断当前任务，发新指令）
- 流式工具输出展示

#### 2.4 多模型自由切换

支持任意模型，**零代码切换**：

- Nous Portal（300+ 模型）
- OpenRouter（200+ 模型）
- NovitaAI、NVIDIA NIM、Xiaomi MiMo、z.ai/GLM、Kimi/Moonshot、MiniMax
- Hugging Face、OpenAI、Anthropic
- 自定义 endpoint

```Shell
// 代码块
hermes model    # 交互式选择模型
# 或直接 /model openrouter:deepseek-r1
```

#### 2.5 六种终端后端（运行环境）

| 后端 | 特点 |
| --- | --- |
| **Local** | 本地执行 |
| **Docker** | 容器隔离 |
| **SSH** | 远程主机 |
| **Singularity** | HPC 环境 |
| **Modal** | Serverless，空闲时近乎零成本 |
| **Daytona** | Serverless，按需唤醒休眠 |

关键：**不是绑定在你的笔记本上**。Agent 跑在云端 VM，你从 Telegram 跟它对话。Daytona/Modal 后端在空闲时几乎不花钱。

#### 2.6 子Agent并行与RPC工具调用

- `spawn` 隔离子 Agent 做并行工作流
- Python 脚本可通过 RPC 调用工具，**将多步流水线压缩为零上下文开销的单轮**
- 支持 Mixture of Agents 模式

#### 2.7 内置 Cron 调度器

用自然语言定义定时任务：

- 每日报告、夜间备份、每周审计
- 自动投递到任意平台
- 无人值守运行

#### 2.8 40+ 内置工具

涵盖：

| 类别 | 工具 |
| --- | --- |
| **文件操作** | 读写、搜索、状态管理 |
| **浏览器** | CDP 浏览器、CamoFox、对话框处理、监督器 |
| **代码执行** | 本地/容器执行 |
| **计算机使用** | GUI 自动化（Linux AT-SPI + Wayland/X11） |
| **MCP** | 任意 MCP Server 集成 |
| **搜索** | Web 搜索、X/Twitter 搜索 |
| **媒体** | 图像生成（FAL）、视频生成、TTS（NeuTTS）、语音转录 |
| **生产力** | Kanban、Todo、Note-taking |
| **协作** | Discord、飞书文档/云盘、Microsoft Graph |
| **Home Assistant** | 智能家居控制 |
| **Skill 管理** | 创建、审计、同步、Hub 发布 |
| **内存** | 持久化记忆、会话搜索 |
| **安全** | 审批、路径安全、OSV 漏洞检查、威胁检测 |

#### 2.9 Skills 生态

内置 14 个技能包：

| Skill | 用途 |
| --- | --- |
| apple | Apple 生态集成 |
| autonomous-ai-agents | 自主 Agent 编排 |
| computer-use | GUI 操控 |
| creative | 创意工作流 |
| data-science | 数据科学 |
| dogfood | 内部测试 |
| email | 邮件处理 |
| github | GitHub 操作 |
| media | 媒体处理 |
| mlops | MLOps 工作流 |
| note-taking | 笔记 |
| productivity | 生产力工具 |
| research | 研究工作流 |
| smart-home | 智能家居 |
| social-media | 社交媒体 |
| software-development | 软件开发全流程 |

#### 2.10 研究友好

- 批量轨迹生成（batch trajectory generation）
- 轨迹压缩（trajectory compression）
- 用于训练下一代 tool-calling 模型

#### 2.11 OpenClaw 迁移

内置迁移命令 `hermes claw migrate`，可自动导入 OpenClaw 的：

- SOUL.md、MEMORY.md、USER.md
- Skills、API Keys
- 消息平台配置
- 审批规则

### 三、使用方式

#### 3.1 安装

**Linux / macOS / WSL2：**

```Shell
// 代码块
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc
hermes
```

**Windows（PowerShell，原生支持）：**

```PowerShell
// 代码块
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

**Android / Termux：** 见官方 Termux 指南。

#### 3.2 基础配置

```Shell
// 代码块
hermes setup           # 交互式完整配置向导
hermes model           # 选择 LLM provider 和模型
hermes tools           # 配置启用哪些工具
hermes config set      # 设置单项配置
```

**快速启动（使用 Nous Portal，一个订阅覆盖所有 API）：**

```Shell
// 代码块
hermes setup --portal  # OAuth 登录 + 自动配置全部工具网关
hermes portal info     # 查看已接入的工具
```

#### 3.3 CLI 使用

```Shell
// 代码块
hermes                          # 启动 TUI 对话
/new                            # 新建对话
/model openrouter:deepseek-r1   # 切换模型
/personality coder              # 设置人格
/retry                          # 重试上一轮
/compress                       # 压缩上下文
/usage                          # 查看用量
/skills                         # 浏览技能
/stop                           # 中断当前任务
```

#### 3.4 消息网关

```Shell
// 代码块
hermes gateway setup    # 配置平台（Telegram/Discord/Slack/...）
hermes gateway start    # 启动网关
# 然后在对应平台给 bot 发消息即可
```

#### 3.5 定时任务

```Shell
// 代码块
# 自然语言定义
hermes cron add "每天早上9点给我发昨日工作总结" --deliver telegram
hermes cron add "每周一凌晨2点备份数据库" --deliver slack
```

#### 3.6 OpenClaw 迁移

```Shell
// 代码块
hermes claw migrate              # 交互式迁移（完整）
hermes claw migrate --dry-run    # 预览会迁移什么
hermes claw migrate --preset user-data  # 只迁移用户数据，不含密钥
```

#### 3.7 子Agent与并行

在对话中使用：

```
// 代码块
spawn: 帮我同时研究这三个竞品的技术架构
```

或写 Python 脚本通过 RPC 调用工具：

```Python
// 代码块
from hermes import tool_client

# 多步流水线压缩为单轮
result = tool_client.run([
    ("web_search", {"query": "latest Rust releases"}),
    ("file_write", {"path": "report.md", "content": "..."}),
    ("send_message", {"text": "报告已生成"})
])
```

### 四、落地实践场景

#### 4.1 长期个人助理（最佳场景）

Hermes 的学习闭环使其天然适合**长期陪伴型个人助理**：

- 用得越久，越了解你的偏好和工作方式
- 自动沉淀技能，反复出现的任务越做越快
- 跨会话记忆，不需要每次重新交代背景

#### 4.2 多平台统一消息 Agent

企业/团队场景：一个 Agent 同时服务 Telegram、Discord、Slack、WhatsApp：

- 统一入口，无需每个平台单独开发
- 对话连续性，跨平台无缝切换
- 定时报告自动投递到对应平台

#### 4.3 云端常驻 Agent

用 Modal/Daytona 后端部署为**常驻云端 Agent**：

- 空闲时近乎零成本（serverless 休眠）
- 随时通过消息平台唤醒
- 适合 7×24 监控、自动化运维、定时任务

#### 4.4 研究与数据分析

Skills 中的 `research`、`data-science` 包 + 批量轨迹生成：

- 自动化多步研究流水线
- 生成训练数据用于微调 tool-calling 模型

#### 4.5 软件开发 Agent

`software-development` skill + 40+ 工具：

- 代码生成、测试、部署全流程
- 与 GitHub 深度集成
- 子 Agent 并行处理多模块

#### 4.6 智能家居 + 生活自动化

Home Assistant 集成 + Cron + 多平台投递：

- "每天出门前告诉我今天天气和日程"
- "检测到异常温度时发 Telegram 告警"

### 五、个人评价与建议

#### 优势

1. **学习闭环是真正差异化**。大多数 Agent 框架是无状态的，每次对话从零开始。Hermes 的技能自创建、自改进、知识主动持久化形成正反馈循环，这在生产环境中有巨大价值——用一个月后的 Hermes 比第一天的强得多。

1. **架构设计成熟**。六种终端后端、多模型零代码切换、多平台网关、子Agent并行——这些不是 demo 级拼凑，是工程化考虑的结果。12,677 commits、201k stars 说明社区规模和成熟度。

1. **Serverless 运行模式是亮点**。Modal/Daytona 后端解决了"Agent 必须跑在我电脑上"的痛点，空闲零成本是实际部署的刚需。

1. **OpenClaw 迁移友好**。对现有用户群有明确迁移路径，降低切换成本。

1. **工具生态极丰富**。40+ 内置工具 + 14 个 Skill 包 + MCP 集成，覆盖绝大多数场景。

#### 不足

1. **复杂度高**。功能太多，初学者容易迷失。`hermes setup` 向导虽然帮助配置，但理解全貌的学习曲线不低。

1. **Nous Portal 依赖**。虽然支持多 provider，但最顺滑的体验绑定 Nous Portal 订阅。对于只想用 OpenAI/Anthropic 的用户，部分高级功能（Tool Gateway）需要额外配置。

1. **自进化机制的黑盒性**。技能自动创建和改进的过程对用户不够透明——"它自己学会了什么"需要更好的可观测性。

1. **项目体量巨大**。12,677 commits、1,241 branches 意味着代码库庞大，贡献者上手成本高，Bug 排查也不容易。

#### 建议

1. **值得深度试用**。Hermes 的学习闭环在长期使用中才能体现价值，建议至少连续使用两周，观察技能沉淀和用户建模效果。

1. **从单场景切入**。不要试图一次用所有功能。建议从"CLI + 1个消息平台 + 1个 Skill"开始，逐步扩展。

1. **关注 Serverless 部署**。Modal/Daytona 后端是实际生产部署的关键，建议优先验证这两个后端的稳定性和成本。

1. **作为 OpenClaw 的对标参考**。Hermes 在学习闭环、多平台网关、Serverless 运行方面的设计值得 OpenClaw 生态借鉴。特别是"技能自创建"和"用户建模"两个机制，是 Agent 从工具走向伙伴的关键能力。

1. **注意安全边界**。Agent 自主创建和执行技能意味着权限边界需要严格管控——确保审批机制（approval system）始终开启。

---

*本报告由自动化研究任务生成 | 2026-06-24*
