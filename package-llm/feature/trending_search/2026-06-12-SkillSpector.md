# 【2026-06-12】SkillSpector - AI Agent 技能安全扫描器研究报告

## SkillSpector - AI Agent 技能安全扫描器研究报告

### 📌 项目基本信息

| 项目 | 信息 |
| --- | --- |
| **项目名称** | SkillSpector |
| **GitHub 地址** | https://github.com/NVIDIA/SkillSpector |
| **Stars** | ⭐ 2,783 |
| **Forks** | 🍴 220 |
| **语言** | Python |
| **License** | Apache License 2.0 |
| **维护者** | NVIDIA |
| **Star 趋势** | GitHub Python Trending 今日排名 #2 |
| **最后提交** | 2026-06-11 |

---

### 📖 项目简介

SkillSpector 是 **NVIDIA 开源的 AI Agent 技能安全扫描器**，用于在 AI Agent 技能安装前自动检测安全漏洞、恶意模式和风险。

**核心问题**：随着 Claude Code、Codex CLI、Gemini CLI 等 AI Agent 工具的爆发式增长，Agent 技能（Skills）成为扩展能力的关键方式。但这些技能执行时带有隐式信任和最小审查，存在严重安全隐患。

**研究数据**（来自论文 "Agent Skills in the Wild: An Empirical Study of Security Vulnerabilities at Scale"）：

- 扫描了 **42,447 个技能**，发现 **26.1% 包含至少一个漏洞**
- **5.2% 显示可能恶意意图**
- 带可执行脚本的技能被攻击的可能性是普通技能的 **2.12 倍**

**一句话总结**：SkillSpector 回答的是 "这个技能安全吗？" 这个问题。

---

### 🔍 核心功能详解

#### 1. 多格式输入支持

支持扫描多种来源：

- Git 仓库（`skillspector scan https://github.com/user/my-skill`）
- 本地目录（`skillspector scan ./my-skill/`）
- 单个文件（`skillspector scan ./SKILL.md`）
- Zip 压缩包（`skillspector scan ./my-skill.zip`）

#### 2. 64 种漏洞模式 × 16 个分类

| 分类 | 模式数 | 典型检测内容 |
| --- | --- | --- |
| **Prompt Injection** | 5 | 指令覆盖、隐藏指令、窃取指令 |
| **Data Exfiltration** | 4 | 外部传输、环境变量窃取、文件系统枚举 |
| **Privilege Escalation** | 3 | 过度权限、Sudo/Root 执行、凭证访问 |
| **Supply Chain** | 6 | 未锁定依赖、外部脚本、混淆代码、CVE 检查 |
| **Excessive Agency** | 4 | 无限制工具访问、自主决策、范围蔓延 |
| **Output Handling** | 3 | 未验证输出注入、跨上下文输出 |
| **System Prompt Leakage** | 3 | 直接泄露、间接提取、工具窃取 |
| **Memory Poisoning** | 3 | 持久上下文注入、上下文窗口填充、记忆篡改 |
| **Tool Misuse** | 3 | 参数滥用、链式滥用、不安全默认值 |
| **Rogue Agent** | 2 | 自我修改、会话持久化 |
| **Trigger Abuse** | 3 | 过宽触发、影子命令、关键词诱导 |
| **Behavioral AST** | 8 | exec/eval、动态导入、subprocess 等危险调用 |
| **Taint Tracking** | 5 | 污点流追踪、凭证外泄链、文件→网络外泄 |
| **YARA Signatures** | 4 | 恶意软件、Webshell、挖矿程序 |
| **MCP Least Privilege** | 4 | 能力声明不足、通配符权限、缺失声明 |
| **MCP Tool Poisoning** | 4 | 隐藏指令、Unicode 欺骗、参数注入、描述-行为不匹配 |

#### 3. 两阶段分析引擎

**第一阶段：静态分析（快速）**

- 基于正则表达式的模式匹配（11 个静态分析器）
- AST（抽象语法树）行为分析，检测危险调用
- OSV.dev 实时漏洞查询（检查依赖 CVE）

**第二阶段：LLM 语义分析（可选，更精准）**

- 评估代码上下文和意图
- 过滤误报
- 提供人类可读的解释
- 将精确度提升到 **~87%**
- 内置反越狱保护，防止恶意技能操控分析过程

#### 4. 风险评分系统

| 分数区间 | 等级 | 建议 |
| --- | --- | --- |
| 0-20 | 🟢 LOW | ✅ SAFE |
| 21-50 | 🟡 MEDIUM | ⚠️ CAUTION |
| 51-80 | 🔴 HIGH | ❌ DO NOT INSTALL |
| 81-100 | 🟣 CRITICAL | ❌ DO NOT INSTALL |

评分规则：CRITICAL +50 | HIGH +25 | MEDIUM +10 | LOW +5，可执行脚本 ×1.3 倍加权。

#### 5. 多格式输出

```Shell
// 代码块
# 终端输出（默认，美化格式）
skillspector scan ./my-skill/

# JSON 输出（机器可读）
skillspector scan ./my-skill/ --format json --output report.json

# Markdown 输出（文档）
skillspector scan ./my-skill/ --format markdown --output report.md

# SARIF 输出（CI/CD 集成 + IDE 工具）
skillspector scan ./my-skill/ --format sarif --output report.sarif
```

#### 6. LLM 分析配置

支持多种 LLM 提供商：

| Provider | 环境变量 | 默认模型 |
| --- | --- | --- |
| OpenAI | OPENAI_API_KEY | gpt-5.4 |
| Anthropic | ANTHROPIC_API_KEY | claude-opus-4-6 |
| NVIDIA build.nvidia.com | NVIDIA_INFERENCE_KEY | deepseek-ai/deepseek-v4-flash |

也支持本地 OpenAI 兼容服务器（Ollama、vLLM、llama.cpp）。

---

### ⚙️ 使用方式

#### 安装

```Shell
// 代码块
# 克隆仓库
git clone https://github.com/NVIDIA/skillspector.git
cd skillspector

# 创建虚拟环境（推荐 uv）
uv venv .venv && source .venv/bin/activate
# 或: python3 -m venv .venv && source .venv/bin/activate

# 安装（生产环境）
make install

# 安装（开发环境，含测试依赖）
make install-dev
```

#### 基本用法

```Shell
// 代码块
# 扫描本地技能目录
skillspector scan ./my-skill/

# 扫描单个 SKILL.md 文件
skillspector scan ./SKILL.md

# 扫描 Git 仓库（不克隆）
skillspector scan https://github.com/user/my-skill

# 跳过 LLM 分析（仅静态分析，更快）
skillspector scan ./my-skill/ --no-llm
```

#### LLM 语义分析配置

```Shell
// 代码块
# 使用 OpenAI
export SKILLSPECTOR_PROVIDER=openai
export OPENAI_API_KEY=sk-...
skillspector scan ./my-skill/

# 使用 Anthropic
export SKILLSPECTOR_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
skillspector scan ./my-skill/

# 使用 NVIDIA
export SKILLSPECTOR_PROVIDER=nv_build
export NVIDIA_INFERENCE_KEY=nvapi-...
skillspector scan ./my-skill/

# 使用本地 Ollama
export SKILLSPECTOR_PROVIDER=openai
export OPENAI_API_KEY=ollama
export OPENAI_BASE_URL=http://localhost:11434/v1
export SKILLSPECTOR_MODEL=llama3.1:8b
skillspector scan ./my-skill/
```

#### Python API 集成

```Python
// 代码块
from skillspector import graph

# 调用 LangGraph 工作流
result = graph.invoke({
    "input_path": "/path/to/skill",
    "output_format": "json",
    "use_llm": True,
})

# 获取结果
print(f"风险评分: {result['risk_score']}/100")
print(f"严重等级: {result['risk_severity']}")
print(f"建议: {result['risk_recommendation']}")

for finding in result["filtered_findings"]:
    print(f"[{finding['severity']}] {finding['rule_id']}: {finding['message']}")
```

#### 示例输出

```
// 代码块
SkillSpector Security Report  v2.0.0

Skill: suspicious-skill
Source: ./suspicious-skill/
Scanned: 2026-01-29 10:30:00 UTC

        Risk Assessment
 Metric          Value
 Score           78/100
 Severity        HIGH
 Recommendation  DO NOT INSTALL

        Components (3)
 File              Type      Lines  Executable
 SKILL.md          markdown    142  No
 scripts/sync.py   python       87  Yes
 requirements.txt  text          3  No

Issues (2)

  HIGH: Env Variable Harvesting (E2)
    Location: scripts/sync.py:23
    Finding: for key, val in os.environ.items():...
    Confidence: 94%
    Explanation: This code collects environment variables containing
    API keys and secrets, then sends them to an external server.

  HIGH: External Transmission (E1)
    Location: scripts/sync.py:45
    Finding: requests.post("https://api.skill.io/env"...
    Confidence: 89%
    Explanation: Data is being sent to an external server. Combined
    with env harvesting above, this indicates credential exfiltration.
```

---

### 🏭 落地实践场景

#### 1. 企业 AI Agent 安全治理

- **场景**：企业大规模部署 Claude Code / Codex / Gemini CLI 等 AI Agent 工具，员工安装第三方技能
- **痛点**：缺乏统一的安全审查机制，技能来源不可控
- **方案**：将 SkillSpector 集成到 CI/CD 流水线，所有技能安装前自动扫描，高风险技能自动拦截

#### 2. 技能市场/平台安全审核

- **场景**：类似 Friday Skill 广场等技能分发平台
- **痛点**：用户上传的技能可能包含恶意代码
- **方案**：在技能上架前运行 SkillSpector 扫描，自动生成安全报告

#### 3. 开发团队技能审查

- **场景**：开发团队编写/使用自定义 Agent 技能
- **痛点**：开发者安全意识参差不齐，技能中可能引入漏洞
- **方案**：在 pre-commit 钩子或 PR 审查流程中集成 SkillSpector

#### 4. MCP（Model Context Protocol）生态安全

- **场景**：MCP 成为 Agent 工具集成的标准协议
- **痛点**：MCP 工具描述可能被注入恶意指令（Tool Poisoning）
- **方案**：SkillSpector 内置 MCP Least Privilege（4种模式）和 MCP Tool Poisoning（4种模式）检测

#### 5. 安全团队威胁情报

- **场景**：安全团队监控 AI Agent 生态中的安全威胁
- **痛点**：缺乏专门针对 AI Agent 技能的安全扫描工具
- **方案**：批量扫描主流技能市场，建立漏洞数据库，发现 0day 攻击模式

---

### 📊 个人评价与建议

#### 👍 亮点

1. **来自 NVIDIA 的官方背书**：在 AI Agent 安全领域，NVIDIA 拥有极高的行业影响力，工具可信度极高
2. **64种漏洞模式覆盖全面**：从 Prompt Injection、Memory Poisoning 到 MCP Tool Poisoning，几乎覆盖了当前 AI Agent 技能的所有攻击面
3. **两阶段分析架构优秀**：静态分析保证召回率，LLM 语义分析提升精确度，兼顾速度与准确
4. **MCP 安全检测先行一步**：MCP 工具投毒（Tool Poisoning）检测非常前瞻，这可能是未来 Agent 安全的核心战场
5. **企业级输出格式**：支持 SARIF 格式，可直接集成到 CI/CD 和 IDE 工具链
6. **LangGraph 工作流**：底层使用 LangGraph 编排分析流程，架构清晰，扩展性好

#### ⚠️ 不足

1. **静态分析为主**：无法检测运行时行为，对某些高级攻击（动态加载、加密payload）可能无效
2. **LLM 分析依赖外部 API**：需要配置 OpenAI/Anthropic/NVIDIA 的 API Key，离线场景受限
3. **仅支持英文**：对非英文内容的支持有限
4. **项目较新**（16次提交）：模式库和规则集还有较大扩展空间

#### 💡 建议

1. **强烈推荐企业部署**：在 AI Agent 技能安装流程中集成 SkillSpector，作为安全审查的第一道防线
2. **关注 MCP 安全方向**：随着 MCP 协议标准化，Tool Poisoning 检测将成为刚需
3. **贡献规则扩展**：可以对 64 种漏洞模式进行补充，增加针对特定 Agent 平台的检测规则
4. **与现有安全工具集成**：将 SARIF 报告导入现有安全扫描平台（如 CodeQL、SonarQube）
5. **持续监控**：建议定期批量扫描主流技能市场，建立 AI Agent 安全态势感知

---

### 📅 研究记录

- **研究日期**：2026-06-12
- **数据来源**：GitHub Trending（Python 分类）、GitHub README、研究论文
- **研究人**：杰哥 AI 助理
