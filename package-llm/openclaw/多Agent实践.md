# 一、为什么需要多个 Agent？

想象一下这个场景：

你让个人助理帮你查个资料，结果她正在埋头写一篇学城文档——十分钟过去了，你的消息还没人理。不是她不想回你，是她在忙，一个 Agent 同时只能干一件事。

这就是"单 Agent 瓶颈"：活越来越多，但打工人只有一个。

解决办法很简单——多招几个打工人。在 CatClaw 里，就是配置多个 Agent，各司其职。比如我的个人团队：

- ☀️ **夏夏（main）** — 私人助理、总管，啥都能干（大象通道）
- 💻 **码哥（coder）** — 编程专家，专写代码（WebChat通道）
- 🔍 **探探（researcher）** — 调研助手，专挖信息（飞书通道）

每个 Agent 有自己的"工位"（工作区）、"工牌"（认证）和"笔记本"（记忆），默认互不干扰。但问题来了——老板布置一个任务，怎么让大家都知道？

**这篇文档就解决这个问题。**

---

# 二、搭团队：创建你的多 Agent 阵容

## 2.1 Agent 是什么？

把 Agent 想象成一个独立的员工。每个员工有：

- 🏠 **自己的工位（Workspace）** — 放着他的工作习惯（`AGENTS.md`）、人设（`SOUL.md`）、对老板的了解（`USER.md`）和工作笔记（`memory/`）
- 🔐 **自己的工牌（agentDir）** — 存认证信息和登录凭证
- 📒 **自己的聊天记录（Sessions）** — 和谁聊了什么，互不串台

## 2.2 办公室长什么样？

```
~/.openclaw/
├── openclaw.json                    # 公司章程（全局配置）
├── workspace/                       # 夏夏的工位
│   ├── AGENTS.md                    # 工作手册
│   ├── SOUL.md                      # 人设卡
│   ├── USER.md                      # 老板档案
│   └── memory/                      # 工作笔记
├── workspace-coder/                 # 码哥的工位
│   ├── AGENTS.md
│   ├── SOUL.md
│   └── memory/
├── workspace-researcher/            # 探探的工位
│   ├── AGENTS.md
│   ├── SOUL.md
│   └── memory/
├── agents/
│   ├── main/agent/                  # 夏夏的工牌柜
│   │   ├── auth-profiles.json
│   │   └── sessions/
│   ├── coder/agent/                 # 码哥的工牌柜
│   │   └── sessions/
│   └── researcher/agent/            # 探探的工牌柜
│       └── sessions/
└── skills/                          # 公司公共技能库
```

## 2.3 怎么"招人"？

### 方式一：用向导招聘（推荐，省心）

```bash
# 招一个码哥
openclaw agents add coder
# 再招一个探探
openclaw agents add researcher

# 看看团队花名册
openclaw agents list --bindings
```

向导会帮你搞定一切：建工位、发工牌、分配座位。

### 方式二：直接写"招聘文件"（手动编辑 `openclaw.json`）

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "default": true,
        "name": "夏夏",
        "workspace": "~/.openclaw/workspace",
        "agentDir": "~/.openclaw/agents/main/agent"
      },
      {
        "id": "coder",
        "name": "码哥",
        "workspace": "~/.openclaw/workspace-coder",
        "agentDir": "~/.openclaw/agents/coder/agent"
      },
      {
        "id": "researcher",
        "name": "探探",
        "workspace": "~/.openclaw/workspace-researcher",
        "agentDir": "~/.openclaw/agents/researcher/agent"
      }
    ]
  }
}
```

## 2.4 关键字段解释

| 字段 | 作用 | 比喻 |
| --- | --- | --- |
| `id` | Agent 唯一标识 | 工号 |
| `default` | 设为 `true` 表示默认接单的人 | 前台 |
| `name` | 显示名称 | 花名 |
| `workspace` | 工作区路径 | 工位地址 |
| `agentDir` | 状态目录 | 工牌柜位置 |
| `model` | 可选，指定使用的模型 | 技能等级 |

## 2.5 注意事项

- **工牌不能共用**：每个 Agent 有独立的 `auth-profiles.json`。需要共享认证？手动把文件复制过去
- **不要让两个人坐同一个工位**：不同 Agent 复用 `agentDir` 会导致认证冲突，别这么干
- **技能分公有和私有**：工作区里的 `skills/` 目录是个人技能，`~/.openclaw/skills/` 是公司公共技能库

---

# 三、分工位：把 Agent 配到不同通道

团队招好了，得安排谁在哪个窗口接待客户——这就是 **Bindings（工位分配表）**。

## 3.1 Bindings 是什么？

简单说就是消息路由规则：来自大象的消息由夏夏处理，来自飞书的消息由探探处理。

CatClaw 按优先级从高到低匹配：

1. 🎯 **精确匹配**（指定某个人/某个群的 ID）
2. 👥 **群组匹配**（Discord Guild、Slack Team）
3. 📱 **账号匹配**（指定哪个账号）
4. 📺 **通道匹配**（整个通道的所有消息）
5. 🏠 **兜底** — 交给默认 Agent

## 3.2 我们的实际配置

夏夏坐大象窗口，探探坐飞书窗口：

```json
{
  "bindings": [
    // 大象消息 → 夏夏
    { "agentId": "main", "match": { "channel": "daxiang" } },
    // 飞书消息 → 探探
    { "agentId": "researcher", "match": { "channel": "feishu" } }
  ]
}
```

就这么简单。

## 3.3 更多玩法

同一通道，不同账号分流（比如一个 Telegram 号给自己用，一个给工作用）：

```json
{
  "bindings": [
    { "agentId": "main", "match": { "channel": "telegram", "accountId": "personal" } },
    { "agentId": "coder", "match": { "channel": "telegram", "accountId": "work" } }
  ]
}
```

同一通道，特定群聊走专人（技术群的消息交给码哥，其他给夏夏）：

```json
{
  "bindings": [
    // 这条更具体，要放前面
    { "agentId": "coder", "match": { "channel": "daxiang", "peer": { "kind": "group", "id": "GROUP_ID" } } },
    // 兜底规则放后面
    { "agentId": "main", "match": { "channel": "daxiang" } }
  ]
}
```

> ⚠️ **顺序很重要**：具体的规则放前面，兜底的放后面。CatClaw 匹配到第一条就停了。

用 CLI 管理也行：

```bash
# 把飞书绑给探探
openclaw agents bind --agent researcher --bind feishu

# 看看当前所有绑定
openclaw agents bindings

# 解绑
openclaw agents unbind --agent researcher --bind feishu
```

## 3.4 支持哪些通道？

WhatsApp、Telegram、Discord、Slack、Signal、iMessage、webchat、飞书（feishu）、大象（daxiang）等。每个通道可以有多个账号，一个 Gateway 同时连所有通道。

> 大象通道使用个人助理只能配置一个机器人，建议将主 Agent 配置为个人助理，其他的 Agent 可以配置为 WebChat 通道。

---

# 四、开通内线：Agent 之间互相发消息

团队招好了，工位分好了，但大家还是各干各的——互相不认识、不能说话。得开通内部通讯录。

## 4.1 开启 Agent 间通信

默认是关闭的（毕竟不是所有公司都需要跨部门沟通 😄），需要手动打开：

```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true,
      // 通讯录白名单：只有这几个人之间能互相联系
      "allow": ["main", "coder", "researcher"]
    }
  }
}
```

## 4.2 让大家能看到彼此

默认每个 Agent 只能看到自己的聊天记录（session）。想让大家互相可见：

```json
{
  "tools": {
    "sessions": {
      // "self": 只看自己（社恐模式）
      // "tree": 自己 + 自己派生的子任务（默认）
      // "agent": 同一 Agent 的所有 session
      // "all": 所有人的所有 session（开放办公）
      "visibility": "all"
    }
  }
}
```

## 4.3 怎么发消息？

用 `sessions_send` 工具，就像发内部即时消息：

```javascript
sessions_send({
  sessionKey: "agent:researcher:feishu:direct:ou_xxx",  // 收件人
  message: "探探，帮我查一下 XX 的市场数据",              // 消息内容
  timeoutSeconds: 30                                     // 等回复最多等 30 秒
})
```

**参数说明**：

| 参数 | 说明 |
| --- | --- |
| `sessionKey` | 目标 session 的 key，通过 `sessions_list` 查 |
| `message` | 消息内容 |
| `timeoutSeconds` | 等回复的超时（0 = 发完就走，不等） |

---

OpenClaw 主 Agent 调用子 Agent 有两种主要方式：

### `sessions_send` — 发消息给已有 session

- **适合**：跨 Agent 通信（夏夏 → 探探）
- **前提**：目标 Agent 已经有活跃 session
- **需要配置**：`agentToAgent.enabled` + `sessions.visibility`

### `sessions_spawn` — 创建新 session 执行任务

- **适合**：一次性任务、需要隔离的计算、不同模型的任务
- 会创建一个全新的 session，执行完自动汇报
- 不需要目标 Agent 已有 session
- 支持 `mode="run"`（一次性）和 `mode="session"`（持久）

### 简单区分

- `sessions_send` = 给同事发消息，让他在现有工位上干活
- `sessions_spawn` = 临时招一个人来干一件事，干完走人

> 两者可以配合使用。比如码哥没有活跃 session 时，我其实可以用 `sessions_spawn` 给他派任务，而不用等他"上线"。

## 4.4 一次对话怎么进行？

1. 夏夏调用 `sessions_list` — 翻通讯录找到探探
2. 夏夏调用 `sessions_send` — 发消息给探探
3. 探探自动接收并处理 — 就像收到一条即时消息
4. 探探回复夏夏 — 支持最多 5 轮来回（可配置 `session.agentToAgent.maxPingPongTurns`）
5. 对话结束后，探探可以选择向飞书推送通知（announce）

## 4.5 实战演示：夏夏给探探派活

```javascript
// 第 1 步：夏夏翻通讯录
sessions_list({ activeMinutes: 60 })
// → 找到探探: agent:researcher:feishu:direct:ou_xxx

// 第 2 步：发任务
sessions_send({
  sessionKey: "agent:researcher:feishu:direct:ou_xxx",
  message: "探探，欢哥让你调研一下 XX 方案，写到 shared/notes/ 里",
  timeoutSeconds: 30
})
// → 探探收到、干活、回复结果
```

## 4.6 配置汇总

两行就搞定：

```json
{
  "tools": {
    "agentToAgent": { "enabled": true, "allow": ["main", "coder", "researcher"] },
    "sessions": { "visibility": "all" }
  }
}
```

---

# 五、共享情报：让所有人看到同一块白板

内线通了，但还有个问题——夏夏派给探探的任务，码哥不知道；探探写好的调研报告，码哥得等夏夏转发。

我们需要一块团队白板，谁写了什么大家都能看到。

## 5.1 建一个共享目录

```bash
mkdir -p ~/.openclaw/shared/notes
```

目录结构：

```
~/.openclaw/shared/
├── board.md          # 公告板：团队动态
├── tasks.md          # 任务看板：谁在干啥
└── notes/            # 共享资料库
    └── *.md          # 调研报告、技术方案等
```

## 5.2 让所有人都能搜到白板内容

配置 `memorySearch.extraPaths`，让每个 Agent 的记忆搜索覆盖共享目录：

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "extraPaths": ["~/.openclaw/shared"]
      }
    }
  }
}
```

**效果**：

- 探探把调研报告写到 `shared/notes/xx-analysis.md`，码哥用 `memory_search` 就能搜到
- 也可以直接用绝对路径 `read` 文件
- 索引有约 1-2 秒的延迟，不是实时的，但够用

## 5.3 白板怎么用？

**`board.md` — 公告板**：

```markdown
# 团队公告板

## 当前任务
- [2026-03-06] 探探：调研多 Agent 信息共享方案 → ✅ 已完成
- [2026-03-06] 码哥：数据抓取脚本 → 🔧 进行中

## 公告
- Agent 间通信已开启，可通过 sessions_send 互相发消息
```

**`tasks.md` — 任务看板**：

```markdown
# 任务清单

## 进行中
- [2026-03-06] 码哥：XX 数据抓取脚本 — 派发人：夏夏

## 已完成
- [2026-03-06] 探探：多 Agent 信息共享调研 — 派发人：欢哥
```

## 5.4 团队协作公约

在每个 Agent 的 `AGENTS.md` 里加一段协作规范，让大家知道怎么配合：

**夏夏（总管）**：

1. 收到复杂任务 → 拆分 → `sessions_send` 派给对应 Agent
2. 派完任务写 `shared/tasks.md`
3. 收到完成回复 → 更新状态 → 汇报欢哥

**码哥（编程）**：

1. 收到任务就干活
2. 干完更新 `shared/tasks.md`
3. 需要调研支持？告诉夏夏安排探探

**探探（调研）**：

1. 收到调研任务就开查
2. 报告写到 `shared/notes/`
3. 干完更新 `shared/tasks.md`

---

# 六、实战：一个任务怎么在团队里流转？

来看一个完整场景——欢哥要做竞品分析，还要写个自动化脚本。

```
🧑 欢哥 → ☀️ 夏夏：
   "帮我做个 XX 竞品分析，分析完让码哥写个数据抓取脚本"

☀️ 夏夏：
   1. 写入 shared/tasks.md（记录任务）
   2. sessions_send → 🔍 探探："请调研 XX 竞品，报告写到 shared/notes/"
   3. 回复欢哥："已安排，我来跟进"

🔍 探探：
   1. 上网搜索、整理资料
   2. 报告写入 shared/notes/xx-analysis.md
   3. 更新 shared/tasks.md
   4. 回复夏夏："调研完成"

☀️ 夏夏：
   1. sessions_send → 💻 码哥："根据 shared/notes/xx-analysis.md 写抓取脚本"
   2. 更新 shared/tasks.md

💻 码哥：
   1. 读取调研报告
   2. 编写脚本
   3. 更新 shared/tasks.md
   4. 回复夏夏："搞定了"

☀️ 夏夏 → 🧑 欢哥：
   "全部搞定！调研报告在 shared/notes/，脚本在 xxx"
```

> 整个过程欢哥只说了一句话，剩下的团队自己跑。

---

# 七、几种方案对比

| 维度 | 🙋 纯人工中转 | 🤖 本方案 | 💬 原生群聊（未来） |
| --- | --- | --- | --- |
| 实现难度 | 零 | 低（改几行配置） | 需等官方支持 |
| 人工参与 | 多（全靠你转发） | 少（夏夏自动协调） | 最少 |
| 信息共享 | 靠复制粘贴 | 共享目录 + 直接通信 | 实时共享 |
| 实时性 | 低 | 中 | 高 |
| 可靠性 | 靠你记性 | 文件持久化 | 待验证 |

---

# 本方案基本原理

**核心组件关系**：

```
Channels（通道）
  → 消息入口，如大象、飞书、Telegram
  ↓
Gateway + Bindings（路由规则）
  → 决定哪个通道的消息交给哪个 Agent
  ↓
Agents（智能体）
  → 各自独立的"大脑"，有自己的工作区、认证、人设
  ↓
Sessions（会话）
  → 每个 Agent 和每个对话方之间产生一个独立 session，存储聊天历史
  ↓
Agent 间通信
  → 通过 sessions_send 互发消息，通过 shared/ 目录共享文件
```

### 参考配置

```
{
  // 第一步：定义团队
  agents: {
    // ...
    list: [
      {
        id: "main",
        default: true,
        name: "夏夏",
        workspace: "~/.openclaw/workspace"
      },
      {
        id: "coder",
        name: "码哥",
        workspace: "~/.openclaw/workspace-coder"
      },
      {
        id: "researcher",
        name: "探探",
        workspace: "~/.openclaw/workspace-researcher"
      }
    ],
    // 第二步：开通共享白板
    defaults: {
      // ...
      memorySearch: {
        extraPaths: ["~/.openclaw/shared"]
      }
    }
  },

  // 第三步：分配工位
  bindings: [
    { agentId: "main", match: { channel: "daxiang" } },
    { agentId: "researcher", match: { channel: "feishu" } }
  ],

  // 第四步：开通内线电话
  tools: {
    agentToAgent: {
      enabled: true,
      allow: ["main", "coder", "researcher"]
    },
    sessions: {
      visibility: "all"
    }
  }
}
```


### 原理
sessions_spawn 和 sessions_send 是两回事：

工具	调用什么	需要什么配置
sessions_spawn	subagent（临时任务实例）	subagents.allowAgents 白名单
sessions_send	已有 session（给在线的同等 Agent 发消息）	agentToAgent.enabled + allow
你的配置现状：

sessions_spawn(agentId="yuyuan") → 走 subagents.allowAgents: ["yuyuan"] ✅ 我可以召唤她
agentToAgent.allow: ["main", "yuyuan"] → 双向 sessions_send 也通 ✅
同等 Agent 互相调用的问题：

芋圆想 sessions_spawn 召唤我 → 不行，她的配置里没有 subagents.allowAgents
芋圆想 sessions_send 给我发消息 → 可以，agentToAgent 是双向的
我召唤芋圆 → 可以，有白名单
所以现在的关系是：我是老板，可以派她干活；她能回话给我，但不能反过来派我干活。这个设计是合理的。