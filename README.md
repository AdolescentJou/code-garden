# Code Garden

代码花园 — 前端知识库与实践示例集合，涵盖 React、Web Components、Node.js、TypeScript、CSS 动画、面试题、LLM/AI 等多个方向的模块化学习与实践项目。

## 目录结构

```
code-garden/
├── package-react/            # React + TypeScript 主应用
├── package-web-components/   # Web Components 动画组件库
├── package-node/             # Node.js 工具与服务器示例
├── node/                     # Express 代理服务
├── package-util/             # 通用工具函数库
├── package-typescript/       # TypeScript 类型技巧与编程范式
├── package-style/            # CSS 样式、布局与动画示例
├── package-interview/        # 面试题与 JavaScript 知识点
├── package-webapi/           # Web API 使用示例
├── package-llm/              # LLM / AI / Agent 文档与技能
├── openclaw-search/          # OpenClaw 检索机制文档
├── package-vue/              # Vue 示例（占位）
└── immer/                    # Immer 相关测试
```

## 模块说明

### package-react

基于 React 18 + TypeScript + Webpack 5 的完整单页应用，用于演示各类 React 特性与前端实践。

- **技术栈**：React 18、TypeScript、Webpack 5、Babel、Less/Sass、Tailwind CSS、Styled Components
- **测试**：Jest、react-testing-library
- **主要组件**：文件上传、虚拟滚动（固定/不定高度）、进度条、Suspense、时间切片、拖拽等

```bash
cd package-react
npm install
npm start
```

### package-web-components

基于原生 Web Components 的动画组件库（`cd-animation`），使用自定义元素和 ES Modules 构建。

- 延迟列表动画、数字变化动画、环形加载等
- 使用 `elfinTpl` 模板引擎

### package-node

Node.js 工具与本地服务器示例集合。

- HTTP 文件服务器
- Glob 文件匹配
- Path 模块用法
- I/O 操作示例

### node

轻量 Express 代理服务，用于转发 API 请求，监听端口 3002。

```bash
cd node
npm install
node index.js
```

### package-util

通用 TypeScript/JavaScript 工具函数库。

| 工具 | 说明 |
|------|------|
| 防抖 / 节流 | 函数调用频率控制 |
| sleep | 延迟执行 |
| createUuid | UUID 生成 |
| scrollToTop | 回到顶部 |
| scrollToBottom | 检测滚动到底部 |
| getStyle | 获取元素样式 |
| filterSpecialChar | 过滤特殊字符 |
| tracking | 埋点工具（含配置） |

### package-typescript

TypeScript 类型系统与编程范式的学习示例。

- **类型技巧**：对象类型逆推导、提取对象 Value 类型、类型收窄等
- **编程范式**：依赖注入 / IoC、装饰器模式

### package-style

CSS 属性、布局与动画的独立示例集。

- **布局**：Flex 三等份、层叠上下文
- **动画**：打点 loading、方块 loading、环形 loading、波浪 loading、hover 效果（圆环补全、下划线过渡）
- **属性**：渐变、font-weight、iconfont、Custom Elements

### package-interview

JavaScript 面试题与知识点示例。

- **手写实现**：call、compose、Promise.finally、Promise.allSettled
- **输出题**：异步打印、作用域相关
- **知识点**：Object.freeze 等

### package-webapi

Web API 使用示例，包含 IntersectionObserver 等浏览器 API 的实践。

### package-llm

LLM 与 AI 相关的文档知识库，涵盖大模型底层原理到应用层实践。

- **底层原理**：Transformer、Attention、CNN/RNN、BERT/GPT、Dense/MoE、扩散模型
- **RAG**：向量数据库、稠密/稀疏向量、混合检索、语义化分段
- **训练流程**：RLHF、全参微调、LoRA、奖励模型
- **应用层**：MCP、Tools/Skills、Agent 框架
- **记忆系统**：短期记忆、长期记忆、事实记忆
- **OpenClaw**：多 Agent 实践、记忆检索策略、跨域检索技能

## 技术栈总览

| 领域 | 技术 |
|------|------|
| 前端框架 | React 18、Web Components |
| 类型系统 | TypeScript、ts-brand |
| 构建工具 | Webpack 5、Babel |
| 样式方案 | Less、Sass、Tailwind CSS、Styled Components |
| 测试 | Jest、react-testing-library |
| 后端 | Node.js、Express |
| 状态管理 | Immer |
| 其他 | reflect-metadata、axios、react-dnd |

## 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd code-garden

# 安装根依赖
npm install

# 启动 React 主应用
cd package-react
npm install
npm start
```

## License

ISC
