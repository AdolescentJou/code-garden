# 【2026-06-13】Agent Skills - AI编码Agent生产级工程技能包研究报告

## Agent Skills - AI 编码 Agent 生产级工程技能包研究报告

> **GitHub 地址**：https://github.com/addyosmani/agent-skills
> **作者**：Addy Osmani（Google Chrome 团队前工程负责人，Web 性能领域权威）
> **Stars**：日增 2,656 ⭐（2026-06-13 Trending #1）
> **许可证**：MIT

---

### 一、项目简介

**Agent Skills** 是一套面向 AI 编码 Agent 的生产级工程技能包，将资深工程师在软件开发中遵循的工作流、质量门禁和最佳实践编码为结构化的 Markdown 技能文件，让 AI Agent 在每个开发阶段都能一致地执行它们。

核心理念：**AI Agent 默认走最短路径，经常跳过 spec、测试、安全审查等关键环节。Agent Skills 不是给 Agent 更好的 prompt，而是给 Agent 结构化的工作流程。**

项目包含 **24 个技能**（覆盖完整开发生命周期）、**4 个专业 Agent 角色**、**7 个斜杠命令**、**4 份参考检查清单**，并原生支持 Claude Code、Cursor、Gemini CLI、Windsurf、GitHub Copilot、Kiro、OpenCode 等主流编码 Agent 工具。

---

### 二、核心功能详解

#### 2.1 七大斜杠命令 — 开发生命周期的入口

| 命令 | 阶段 | 核心原则 |
| --- | --- | --- |
| `/spec` | 定义 | 先写 spec 再写代码 |
| `/plan` | 规划 | 拆解为小而原子化的任务 |
| `/build` | 构建 | 一次实现一个薄片 |
| `/test` | 验证 | 测试是证明，不是装饰 |
| `/review` | 审查 | 提升代码健康度 |
| `/code-simplify` | 简化 | 清晰优于聪明 |
| `/ship` | 发布 | 越快越安全 |

其中 `**/build auto**` 模式允许一次性审批计划后自动执行全部任务——去掉了任务间的人工等待，但保留了每个任务内的测试驱动和独立提交，遇故障或高风险步骤自动暂停。

#### 2.2 24 个技能 — 按开发阶段组织

##### 定义阶段（Define）

- **interview-me**：一次一个问题式访谈，提取用户真正想要的（而非用户以为想要的），直到 ~95% 置信度
- **idea-refine**：结构化的发散/收敛思维，把模糊想法变为具体提案
- **spec-driven-development**：写 PRD（目标、命令、结构、代码风格、测试策略、边界）再写代码

##### 规划阶段（Plan）

- **planning-and-task-breakdown**：将 spec 分解为小而可验证的任务，含验收标准和依赖排序

##### 构建阶段（Build）

- **incremental-implementation**：薄垂直切片——实现、测试、验证、提交。特性开关、安全默认值、可回滚
- **test-driven-development**：红-绿-重构，测试金字塔（80/15/5），DAMP 优于 DRY，Beyoncé 规则
- **context-engineering**：在正确的时间给 Agent 正确的上下文——规则文件、上下文打包、MCP 集成
- **source-driven-development**：每个框架决策都要基于官方文档验证——核实、引用来源、标注未验证项
- **doubt-driven-development**：对每个非平凡决策进行对抗性全新上下文审查——CLAIM → EXTRACT → DOUBT → RECONCILE → STOP
- **frontend-ui-engineering**：组件架构、设计系统、状态管理、响应式设计、WCAG 2.1 AA 无障碍
- **api-and-interface-design**：契约优先设计、Hyrum's Law、One-Version Rule、错误语义、边界验证

##### 验证阶段（Verify）

- **browser-testing-with-devtools**：Chrome DevTools MCP 获取实时运行时数据——DOM 检查、控制台日志、网络追踪、性能分析
- **debugging-and-error-recovery**：五步分流：复现→定位→缩小→修复→防护。Stop-the-line 规则

##### 审查阶段（Review）

- **code-review-and-quality**：五轴审查、变更规模控制（~100行）、严重度标签、审查速度规范
- **code-simplification**：Chesterton's Fence、500 行规则——在保持行为不变的前提下降低复杂度
- **security-and-hardening**：OWASP Top 10 防护、认证模式、密钥管理、依赖审计
- **performance-optimization**：测量优先——Core Web Vitals 目标、分析工作流、包分析、反模式检测

##### 发布阶段（Ship）

- **git-workflow-and-versioning**：Trunk-based 开发、原子提交、变更规模、commit-as-save-point
- **ci-cd-and-automation**：Shift Left、Faster is Safer、特性开关、质量门禁管道
- **deprecation-and-migration**：代码即负债思维、强制/建议性废弃、迁移模式、僵尸代码清理
- **documentation-and-adrs**：架构决策记录(ADR)、API 文档、内联文档标准——记录"为什么"
- **observability-and-instrumentation**：结构化日志、RED 指标、OpenTelemetry 追踪、基于症状的告警
- **shipping-and-launch**：上线前检查清单、特性开关生命周期、分阶段发布、回滚流程

#### 2.3 技能设计哲学 — 三个关键设计选择

1. **流程而非散文**：技能是 Agent 执行的工作流，不是参考文档。每个技能有步骤、检查点和退出标准。
2. **反合理化表**：每个技能包含一张常见借口表（如"我之后再加测试"），配以反驳论据。这是最独特的设计——防止 Agent 和人类用常见借口跳过关键步骤。
3. **验证不可协商**：每个技能以证据需求结束——测试通过、构建输出、运行时数据。"看起来对了"永远不够。

#### 2.4 四个专业 Agent 角色

| 角色 | 视角 | 核心标准 |
| --- | --- | --- |
| **code-reviewer** | 高级 Staff 工程师 | "Staff 工程师会批准这个吗？" |
| **test-engineer** | QA 专家 | 测试策略、覆盖率分析、"证明它"模式 |
| **security-auditor** | 安全工程师 | 漏洞检测、威胁建模、OWASP 评估 |
| **web-performance-auditor** | Web 性能工程师 | Core Web Vitals 审计，含指标诚实规则 |

#### 2.5 Doubt-Driven Development — 最有创新性的技能

这是整个技能包中最具原创性的设计。核心思想：

> **自信的答案不等于正确的答案。长会话累积的上下文会悄悄把假设变成"事实"。**

执行流程：

1. **CLAIM**：写出决策声明和它为什么重要
2. **EXTRACT**：隔离出最小可审查单元（代码 diff 或决策提案），剥离推理过程
3. **DOUBT**：启动一个全新上下文的审查者（subagent），给对抗性 prompt——偏向证伪而非证实
4. **RECONCILE**：将审查发现分类——哪些是真实问题，哪些是基于断章取义的误判
5. **STOP**：满足停止条件——只发现琐碎问题、完成 3 轮循环、或用户覆盖

这本质上是一种 **AI Agent 自我纠偏机制**，通过"另一个自己不带上下文地审视自己的决策"来对抗长对话中的确认偏差。

#### 2.6 核心操作行为（Meta-Skill 中定义的全局规则）

这 6 条规则是所有技能共享的底线：

1. **显式假设**：实现非平凡功能前，先列出你的假设让人类确认
2. **主动管理困惑**：遇到矛盾时先停下，不要猜测
3. **该怼就怼**：不是 yes-machine，有问题直接说
4. **强制简洁**：1000 行能做到的不要写 100 行就够的东西
5. **范围纪律**：只动你被要求动的
6. **验证而非假设**：每个任务以验证通过为完成标准

---

### 三、使用方式

#### 3.1 Claude Code（推荐方式）

```Shell
// 代码块
# 从 Marketplace 安装
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills

# 如果遇到 SSH 错误，用 HTTPS
/plugin marketplace add https://github.com/addyosmani/agent-skills.git
/plugin install agent-skills@addy-agent-skills

# 本地开发
git clone https://github.com/addyosmani/agent-skills.git
claude --plugin-dir /path/to/agent-skills
```

#### 3.2 Cursor

将 `SKILL.md` 文件复制到 `.cursor/rules/` 目录，或引用 `skills/` 目录。

#### 3.3 Gemini CLI

```Shell
// 代码块
# 从仓库安装
gemini skills install https://github.com/addyosmani/agent-skills.git --path skills

# 从本地安装
gemini skills install ./agent-skills/skills/
```

#### 3.4 GitHub Copilot

使用 `agents/` 目录下的 Agent 定义作为 Copilot 人格，技能内容放入 `.github/copilot-instructions.md`。

#### 3.5 典型工作流示例

一个完整功能的技能调用序列：

```
// 代码块
1. /spec          → 写 PRD 定义需求
2. /plan          → 分解为可验证任务
3. /build auto    → 自动执行：实现→测试→提交，每任务独立
4. /review        → 五轴代码审查
5. /code-simplify → 简化过度复杂代码
6. /ship          → 上线前检查清单 + 监控设置
```

一个 bug 修复的精简流程：

```
// 代码块
1. debugging-and-error-recovery → 复现→定位→修复→防护
2. test-driven-development     → 写回归测试
3. code-review-and-quality     → 审查变更
```

---

### 四、落地实践场景

#### 场景 1：团队 AI 编码规范统一

**问题**：多人使用 AI Agent 编码，Agent 风格各异，代码质量参差不齐。
**解法**：团队统一安装 agent-skills，所有 Agent 自动遵循相同的工作流和质量门禁。spec-driven-development 确保需求先行，code-review-and-quality 统一审查标准。

#### 场景 2：AI Agent 代码质量保障

**问题**：AI Agent 生成的代码经常跳过测试、安全审查、性能考量。
**解法**：doubt-driven-development 在关键决策点进行对抗审查；security-and-hardening 自动检查 OWASP Top 10；performance-optimization 测量优先。每个技能的"反合理化表"专门防止 Agent 找借口跳过步骤。

#### 场景 3：新人快速上手大型项目

**问题**：新人对项目架构、编码规范、测试策略不熟悉。
**解法**：spec-driven-development 自动生成项目 spec（技术栈、命令、结构、代码风格、测试策略、边界规则），新人 AI Agent 按规范执行，减少低级错误。

#### 场景 4：高风险变更的安全网

**问题**：生产环境部署、数据迁移、公共 API 变更等高风险操作，AI Agent 可能遗漏关键检查。
**解法**：doubt-driven-development 的 CLAIM→EXTRACT→DOUBT→RECONCILE→STOP 流程；shipping-and-launch 的上线前检查清单和回滚流程；deprecation-and-migration 的废弃迁移模式。

#### 场景 5：跨工具团队协作

**问题**：团队成员使用不同的 AI 编码工具（Claude Code、Cursor、Copilot 等），技能和规则无法共享。
**解法**：agent-skills 用纯 Markdown 编写，原生支持 8+ 种工具，同一套技能在不同工具间复用。

---

### 五、个人评价和建议

#### 优势

1. **理念先进**：不是给 Agent 更好的 prompt，而是给 Agent 结构化的工作流。这是从"prompt engineering"到"process engineering"的范式升级。
2. **反合理化表**：这是最有价值的设计。AI Agent 和人类一样会找借口跳过关键步骤（"之后再写测试""这么简单不需要 spec"），显式列出反驳论据直接解决这个问题。
3. **Doubt-Driven Development**：AI Agent 的自我纠偏机制设计精巧，通过全新上下文的对抗审查对抗确认偏差，这在当前 AI Agent 工具中很少见。
4. **跨工具兼容**：纯 Markdown 技能 + 多工具适配器，一次编写到处运行。
5. **Google 工程实践内化**：融入了 Hyrum's Law、Beyoncé Rule、测试金字塔、Shift Left 等 Google 工程文化的核心概念，不是泛泛而谈而是嵌入到具体步骤中。
6. **渐进式采用**：不要求全部技能一起用，一个 bug fix 只需要 3 个技能，一个完整功能才需要 15 个。

#### 不足

1. **技能粒度不均**：部分技能（如 doubt-driven-development）非常详细（16KB），而部分技能可能偏薄。团队实际使用时可能需要定制。
2. **对 Agent 能力有要求**：doubt-driven-development 需要主 Agent 能 spawn 子 Agent 做全新上下文审查，不是所有 AI 编码工具都支持这种模式。
3. **Token 开销**：24 个技能全量加载 token 开销不小，虽然项目强调"渐进式加载"，但实际使用中 Agent 可能加载不必要的技能。
4. **缺少团队级管理**：没有技能版本管理、A/B 测试、效果度量的机制。对于大规模团队推广，这是刚需。

#### 建议

1. **适合立即尝试**：如果你在用 Claude Code，`/plugin marketplace add` 一行命令就能装上，零成本试水。先用 `/spec` + `/build` 体验核心流程。
2. **重点看 doubt-driven-development**：这个技能的设计思想值得单独研究，即使不用 agent-skills 也可以把 CLAIM→EXTRACT→DOUBT→RECONCILE→STOP 流程手动融入你的工作流。
3. **定制优于全量**：不建议全量使用 24 个技能。根据团队痛点选取 3-5 个核心技能开始，逐步扩展。
4. **内部推广参考**：agent-skills 的技能设计模式（frontmatter + 流程步骤 + 反合理化表 + 验证标准）可以作为公司内部 AI Agent 技能标准的设计参考，尤其是"反合理化表"这个设计非常实用。

---

*研究日期：2026-06-13 | 数据来源：GitHub Trending + 项目 README + Skills 源码*
