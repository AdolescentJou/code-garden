# 【2026-06-26】Page Agent - 阿里巴巴开源网页内AI GUI Agent研究报告

## Page Agent - 阿里巴巴开源网页内AI GUI Agent 研究报告

> 📅 研究日期：2026-06-26
> 🔗 GitHub：https://github.com/alibaba/page-agent
> ⭐ Stars：19,900+ | 🍴 Forks：1,710+ | 📜 License：MIT
> 🏷️ Tags：`ai-agents` `browser-automation` `mcp` `typescript` `web`

---

### 一、项目简介

**Page Agent** 是阿里巴巴开源的**网页内 GUI Agent**——一个"住在你的网页里"的 AI 智能体。它的核心理念极其简单：**不需要浏览器扩展、不需要 Python、不需要 Headless Browser**，只需在网页中嵌入一段 JavaScript，就能用自然语言控制网页界面。

传统的 Web Agent（如 browser-use、Playwright MCP 等）大多运行在服务端或需要浏览器扩展，通过截图+多模态 LLM 来"看"页面并操作。Page Agent 走了一条完全不同的路：

- **纯前端运行**：直接在浏览器页面内执行，无需任何外部依赖
- **文本化 DOM 操控**：不截图、不用多模态 LLM，直接读取和操作 DOM 文本
- **极低接入门槛**：一行 `<script>` 标签即可集成

这种设计让它天然适合嵌入 SaaS 产品，作为 AI Copilot 能力直接交付给终端用户。

---

### 二、核心功能详解

#### 2.1 文本化 DOM 感知与操控

Page Agent 最核心的技术选择是**不使用截图，而是将 DOM 树文本化**后交给 LLM 理解。具体流程：

1. **DOM 提取**：从当前页面中提取可交互元素（按钮、输入框、链接等），生成结构化的文本描述
2. **LLM 推理**：将用户自然语言指令 + DOM 文本描述发送给 LLM，让模型决策要执行的操作
3. **操作执行**：根据 LLM 返回的指令，在页面上执行点击、输入、选择等操作

这种方式的优势：

- **速度快**：不需要截图、不需要视觉模型，文本传输和推理都更快
- **成本低**：纯文本 Token 消耗远低于图像 Token
- **精度高**：直接操作 DOM 元素，不存在视觉定位偏差
- **无需特殊权限**：不需要 `debugger`、`unsafe-eval` 等敏感浏览器权限

#### 2.2 极简集成方式

**一行代码集成**：

```HTML
// 代码块
<script src="https://cdn.jsdelivr.net/npm/page-agent@1.10.0/dist/iife/page-agent.demo.js" crossorigin="true"></script>
```

这行代码会自动在页面右下角注入一个浮动的 Agent 对话框，用户可以直接用自然语言与网页交互。

**NPM 安装方式**：

```Shell
// 代码块
npm install page-agent
```

```TypeScript
// 代码块
import { PageAgent } from 'page-agent'

const agent = new PageAgent({
  model: 'qwen3.5-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'YOUR_API_KEY',
  language: 'en-US',
})

await agent.execute('Click the login button')
```

#### 2.3 Bring Your Own LLM

Page Agent 不绑定任何特定 LLM，支持所有兼容 OpenAI API 格式的模型：

```TypeScript
// 代码块
const agent = new PageAgent({
  model: 'gpt-4o',  // 或 qwen、claude、deepseek 等
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'YOUR_API_KEY',
})
```

官方默认推荐阿里通义千问（Qwen）系列，但完全可以用任意 OpenAI 兼容 API。

#### 2.4 Chrome 扩展（可选）

虽然 Page Agent 的核心设计是"页面内运行"，但对于需要跨标签页操作的场景，提供了可选的 Chrome 扩展：

- **多标签页协调**：Agent 可以跨多个浏览器标签页执行任务
- **持久化存在**：不依赖单个页面的生命周期
- **页面外控制**：可以从扩展层面操控任意已打开的页面

#### 2.5 MCP Server（Beta）

Page Agent 提供了 MCP Server 支持，允许外部 AI Agent 客户端通过 MCP 协议控制浏览器：

- 将 Page Agent 作为 MCP Tool 暴露给 Claude、GPT 等 Agent
- Agent 可以远程指挥浏览器执行操作
- 实现了"Agent 控制浏览器"的完整链路

#### 2.6 Monorepo 架构

项目采用 monorepo 结构，核心包包括：

| 包名 | 职责 |
| --- | --- |
| `core` | 核心逻辑：DOM 提取、LLM 交互、动作执行 |
| `page-agent` | 主入口包，整合所有模块 |
| `page-controller` | 页面控制器，管理 DOM 操作 |
| `llms` | LLM 适配层，支持多种模型 |
| `mcp` | MCP Server 实现 |
| `extension` | Chrome 扩展 |
| `ui` | 前端 UI 组件（浮动对话框等） |
| `website` | 文档站点 |

---

### 三、使用方式

#### 3.1 最快体验（Demo 模式）

```HTML
// 代码块
<!DOCTYPE html>
<html>
<head>
  <title>Page Agent Demo</title>
</head>
<body>
  <h1>My Web App</h1>
  <button id="submit">Submit Form</button>
  <input id="name" placeholder="Enter your name" />
  
  <!-- 一行集成 Page Agent -->
  <script src="https://cdn.jsdelivr.net/npm/page-agent@1.10.0/dist/iife/page-agent.demo.js" crossorigin="true"></script>
</body>
</html>
```

打开页面后，右下角会出现 Agent 对话框，输入"点击提交按钮"或"在输入框填入张三"即可操控页面。

#### 3.2 生产环境集成（NPM）

```Shell
// 代码块
npm install page-agent
```

```TypeScript
// 代码块
import { PageAgent } from 'page-agent'

// 初始化 Agent
const agent = new PageAgent({
  model: 'qwen3.5-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.LLM_API_KEY,
  language: 'zh-CN',
})

// 执行自然语言指令
await agent.execute('在搜索框中输入"天气预报"并点击搜索')

// 监听执行事件
agent.on('action', (action) => {
  console.log('执行操作:', action.type, action.target)
})

agent.on('error', (err) => {
  console.error('执行出错:', err)
})
```

#### 3.3 自定义 DOM 范围

```TypeScript
// 代码块
const agent = new PageAgent({
  model: 'gpt-4o',
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'YOUR_API_KEY',
  // 限制 Agent 只能操作特定区域
  scope: '#main-content',
})
```

#### 3.4 编程式调用

```TypeScript
// 代码块
// 不显示 UI，纯编程调用
const agent = new PageAgent({
  model: 'qwen3.5-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'YOUR_API_KEY',
  visible: false,  // 不显示浮动 UI
})

// 在自动化流程中使用
const result = await agent.execute('获取页面上所有商品价格')
console.log(result)
```

---

### 四、落地实践场景

#### 4.1 SaaS 产品 AI Copilot

**最核心的落地场景。** 在 SaaS 产品中嵌入 Page Agent，让用户通过自然语言操作复杂的后台界面。

- ERP 系统："帮我筛选出本月销售额超过 10 万的客户"
- CRM 系统："把所有未跟进超过 7 天的线索标记为待处理"
- 后台管理："批量删除状态为已过期的记录"

**优势**：无需改造后端 API，直接在 UI 层面实现智能操作，极大地降低了用户的学习成本。

#### 4.2 智能表单填写

将繁琐的多步骤表单填写变成一句话：

- 报销系统："填一张差旅报销单，出差日期6月20-22日，目的地上海，住宿费1200，交通费580"
- 入职系统："帮我填写入职信息，姓名张三，部门技术部，岗位前端工程师"

#### 4.3 无障碍访问

让视障用户或行动不便的用户通过语音/文字指令操作网页：

- 配合语音识别："点击右上角的菜单"
- 配合屏幕阅读器：Agent 自动描述页面状态并执行操作

#### 4.4 自动化测试

利用 Page Agent 的编程式接口进行智能 UI 测试：

```TypeScript
// 代码块
const agent = new PageAgent({ /* config */ })

// 用自然语言描述测试步骤
await agent.execute('打开用户列表页面')
await agent.execute('点击添加用户按钮')
await agent.execute('在姓名输入框中输入测试用户')
await agent.execute('点击保存按钮')
await agent.execute('验证提示消息包含"添加成功"')
```

#### 4.5 企业内部系统提效

大量企业内部系统（OA、审批、报销等）交互复杂但缺乏 API，Page Agent 可以作为"UI 层 API"直接嵌入，让用户用自然语言完成操作，无需逐个点击。

---

### 五、技术亮点与局限性

#### ✅ 技术亮点

1. **零依赖架构**：纯前端运行，不需要 Python、不需要 Headless Browser、不需要浏览器扩展（核心功能）
2. **文本化 DOM 方案**：避免了截图+视觉模型的高成本和低精度，直接操作 DOM，精确且高效
3. **极低接入门槛**：一行 `<script>` 即可集成，5 分钟从零到可用
4. **BYO-LLM**：不绑定任何模型，兼容 OpenAI API 格式即可
5. **MCP 生态对接**：通过 MCP Server 可以被外部 Agent 调用，实现 Agent 间的协作
6. **MIT 开源**：商业友好，可以自由集成到任何产品

#### ⚠️ 局限性

1. **同源限制**：纯前端运行意味着只能操作当前页面的 DOM，跨域页面无法直接控制
2. **复杂页面支持**：对于大量动态渲染、Shadow DOM、iframe 嵌套的复杂页面，DOM 提取可能不够完整
3. **LLM 依赖**：效果严重依赖底层 LLM 的理解能力，复杂指令可能需要多次交互
4. **安全性考量**：在生产环境中嵌入 LLM API Key 到前端代码存在泄露风险，需要通过后端代理
5. **无视觉理解**：纯文本方案无法处理依赖视觉布局的交互（如拖拽排序、画布操作等）

---

### 六、个人评价和建议

#### 评价

Page Agent 是一个**设计理念非常清晰**的项目。在 Web Agent 这个赛道上，大多数玩家走的是"截图+视觉模型+服务端控制"的重型路线，Page Agent 却反其道而行之，选择了"文本化 DOM + 前端内嵌"的轻量路线。这个选择带来了几个显著优势：

1. **接入成本极低**：对比 browser-use 需要 Python 环境和 Playwright，Page Agent 一行 script 搞定
2. **运行成本极低**：纯文本 Token 消耗远低于图像 Token
3. **定位精度极高**：直接操作 DOM 元素，不存在视觉模型的定位偏差问题

对于 SaaS 产品想快速上线 AI Copilot 能力，Page Agent 可能是目前接入成本最低的方案。

#### 建议

1. **API Key 安全**：生产环境中务必通过后端代理转发 LLM 请求，不要将 API Key 暴露在前端代码中
2. **操作边界控制**：建议通过 `scope` 限制 Agent 的操作范围，避免误操作关键元素
3. **关注 Chrome 扩展 + MCP 组合**：如果需要跨页面或被外部 Agent 调用，Chrome 扩展 + MCP Server 的组合是完整方案
4. **适用场景选择**：Page Agent 最适合"结构化表单操作"和"可预测的 UI 交互"场景，对于高度动态或视觉驱动的交互（如游戏、画布、拖拽），可能仍需要视觉方案
5. **与 browser-use 互补**：Page Agent 的 DOM 文本化方案和 browser-use 的视觉方案并不冲突，在需要高精度 DOM 操作时用 Page Agent，在需要视觉理解时用 browser-use，两者可以互补

#### 竞品对比

| 特性 | Page Agent | browser-use | Playwright MCP |
| --- | --- | --- | --- |
| 运行环境 | 前端页面内 | Python + Browser | Node.js + Browser |
| 感知方式 | DOM 文本化 | 截图 + 视觉模型 | DOM API |
| 需要 Python | ❌ | ✅ | ❌ |
| 需要浏览器扩展 | ❌（可选） | ❌ | ❌ |
| 多模态 LLM | 不需要 | 需要 | 不需要 |
| 接入成本 | 极低 | 中等 | 中等 |
| 精度 | 高（直接操作 DOM） | 中（视觉定位） | 高（直接 API） |
| 跨页面 | 需扩展 | ✅ | ✅ |
| MCP 支持 | ✅ | ❌ | ✅ |

---

*本报告由 OpenClaw 自动化生成，基于 GitHub Trending 2026-06-26 数据。*
