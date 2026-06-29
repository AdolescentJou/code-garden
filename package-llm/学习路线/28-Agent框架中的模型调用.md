# 28. Agent 框架中的模型调用 — ReAct/CoT、工具调用协议、MCP协议

### 标题

**让AI拥有"手脚"：Agent框架如何把大模型变成能做事的智能体**

### 一句话总结

Agent框架解决的是"大模型只会聊天不会做事"的问题——通过推理-行动循环、工具调用协议，让模型成为能自主完成复杂任务的智能体。就像给一个只会说话的专家装上手脚——他不仅能告诉你怎么做，还能亲自去做。

### 前置知识

- **第19天 RAG基础**：RAG是Agent获取外部知识的重要手段
- **第26天 推理框架**：Agent需要低延迟推理来驱动多轮推理-行动循环
- **第18天 RLHF/对齐**：Agent的行为安全需要对齐约束

---

### 核心概念

#### 从LLM到Agent的进化

```
// 代码块
传统LLM的使用方式：
  用户 → 输入问题 → LLM思考 → 输出答案
  特点：一问一答，不会主动获取信息，不会执行操作

Agent的使用方式：
  用户 → 输入任务 → Agent思考 → 执行行动 → 观察结果 → 再思考 → 再行动 → ... → 输出最终结果
  特点：多轮推理-行动循环，能搜索、能写代码、能调用API

  示例：
  用户："帮我查一下北京明天的天气，如果下雨就提醒我带伞"
  
  Agent的执行过程：
  Thought: 我需要查询北京明天的天气
  Action: search_weather
  Action Input: {"city": "北京", "date": "明天"}
  Observation: 北京明天小雨，气温18-25°C
  Thought: 明天下雨，需要提醒用户带伞
  Action: send_notification
  Action Input: {"message": "明天北京有小雨，记得带伞！"}
  Observation: 通知已发送
  Thought: 任务完成，可以回复用户了
  Action: finish
  Action Input: "已为您查询了北京明天的天气（小雨，18-25°C），并已发送带伞提醒。"
```

> 类比：传统LLM像一个被绑住手脚的专家（只能说话），Agent像一个自由行动的助手（能说话、能查资料、能写代码、能调用API）。

#### ReAct（Reasoning + Acting）—— Agent的核心范式

> 2022年Yao等人的开创性工作。核心思想：**把推理和行动交织在一起**，而不是分开。

##### 为什么ReAct比纯CoT好？

```
// 代码块
纯CoT（Chain-of-Thought）：
  问题 → 思考1 → 思考2 → 思考3 → 答案
  
  问题：2024年诺贝尔物理学奖得主是谁？
  CoT：我需要回忆一下...2024年诺贝尔物理学奖...嗯...可能是Hinton？
  → 问题：如果模型不知道（训练数据截止），就会瞎猜

ReAct：
  问题 → 思考1 → 行动1 → 观察1 → 思考2 → 行动2 → 观察2 → 答案
  
  问题：2024年诺贝尔物理学奖得主是谁？
  Thought: 我不确定，需要搜索
  Action: search_web
  Action Input: "2024年诺贝尔物理学奖"
  Observation: 2024年诺贝尔物理学奖授予John Hopfield和Geoffrey Hinton
  Thought: 找到了答案，可以回复
  Action: finish
  Action Input: "2024年诺贝尔物理学奖授予John Hopfield和Geoffrey Hinton"
  
  → 优势：通过行动获取实时信息，不依赖模型记忆
```

**ReAct的三要素**：

1. **Thought（思考）**：模型推理，决定下一步做什么
2. **Action（行动）**：调用工具/API获取信息或执行操作
3. **Observation（观察）**：工具返回的结果，作为下一轮思考的输入

##### ReAct的Prompt模板

```
// 代码块
你是一个有帮助的助手。你可以使用以下工具：

{tools_description}

你必须使用以下格式：

Thought: 你的思考过程
Action: 工具名称
Action Input: 工具输入（JSON格式）

Observation: 工具返回的结果

...（Thought/Action/Observation可以重复多次）

Thought: 我已经获得了足够的信息，可以回答了
Action: finish
Action Input: 最终答案

开始！

问题：{user_query}
Thought: 
```

#### 工具调用协议

##### Function Calling（OpenAI）

OpenAI在2023年推出了Function Calling功能，让模型可以结构化地调用函数：

```Python
// 代码块
# 定义工具
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                    "date": {"type": "string", "description": "日期(可选)"}
                },
                "required": ["city"]
            }
        }
    }
]

# 模型自动决定是否调用工具
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "北京今天天气怎么样？"}],
    tools=tools,
    tool_choice="auto"  # auto: 模型自己决定是否调用
)

# 模型返回工具调用请求
if response.choices[0].message.tool_calls:
    tool_call = response.choices[0].message.tool_calls[0]
    # tool_call.function.name = "get_weather"
    # tool_call.function.arguments = '{"city": "北京"}'
    
    # 执行函数
    result = get_weather(city="北京")
    
    # 把结果喂回模型
    response2 = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "user", "content": "北京今天天气怎么样？"},
            {"role": "assistant", "content": None, 
             "tool_calls": response.choices[0].message.tool_calls},
            {"role": "tool", "content": result, 
             "tool_call_id": tool_call.id}
        ]
    )
    print(response2.choices[0].message.content)
    # 输出："北京今天晴，最高32°C，最低24°C，注意防晒。"
```

##### MCP（Model Context Protocol）—— Anthropic的革命性协议

> MCP被称为"AI的USB-C接口"——一个统一协议连接所有工具和数据源。

**为什么需要MCP？**

```
// 代码块
Function Calling的问题：
  ├─ 每个平台（OpenAI、Anthropic、Google）的Function Calling格式不同
  ├─ 每次换模型都要重写工具调用代码
  └─ 工具和模型深度耦合，无法复用

MCP的解决方案：
  ├─ 统一协议：所有模型都用同一种格式调用工具
  ├─ 解耦：工具开发和模型选择互相独立
  ├─ 可复用：一个MCP Server可以被任何支持MCP的模型使用
  └─ 标准化：已捐赠给Linux基金会，成为开放标准
```

**MCP的架构**：

```
// 代码块
MCP架构：

  ┌──────────┐     MCP协议      ┌──────────┐
  │ MCP      │ ←──────────────→ │ MCP      │
  │ Client   │   (JSON-RPC)     │ Server   │
  │ (模型侧)  │                  │ (工具侧)  │
  └──────────┘                  └──────────┘
       ↑                             ↑
       │                             │
  ┌──────────┐                  ┌──────────┐
  │ LLM      │                  │ 工具/数据源│
  │ (Claude/ │                  │ ├─ 数据库  │
  │  GPT/    │                  │ ├─ 文件系统│
  │  Qwen)   │                  │ ├─ API    │
  └──────────┘                  │ ├─ 搜索   │
                                │ └─ 自定义  │
                                └──────────┘

MCP Server提供的三类能力：
  1. Resources（资源）：可读取的数据源（文件、数据库记录等）
  2. Tools（工具）：可执行的函数（搜索、计算、API调用等）
  3. Prompts（提示）：预定义的提示模板

MCP协议核心消息：
  ├─ list_resources: 列出可用资源
  ├─ read_resource: 读取资源内容
  ├─ list_tools: 列出可用工具
  ├─ call_tool: 调用工具
  └─ list_prompts: 列出可用提示模板
```

**MCP vs Function Calling对比**：

| 维度 | Function Calling | MCP |
| --- | --- | --- |
| **标准化** | 各家不同 | 统一开放标准 |
| **工具复用** | 不可复用（和模型绑定） | 可复用（任何模型都能用） |
| **开发效率** | 每个工具单独开发 | 一个MCP Server服务所有模型 |
| **生态** | 封闭 | 开放（Linux基金会管理） |
| **支持模型** | OpenAI/Anthropic等 | Claude/GPT/Qwen等越来越多 |

#### Agent推理优化

**Agent推理的挑战**：

- 每轮需要多次LLM调用（思考→行动→观察→思考）
- 对于复杂任务可能需要10+轮，每次调用都产生Token费用
- 推理延迟直接影响用户体验

```
// 代码块
优化策略：

1. 并行工具调用：
   传统：工具A → 工具B → 工具C（串行，慢）
   优化：工具A | 工具B | 工具C（并行，快）
   
   适用场景：多个工具调用之间没有依赖关系
   例如：同时搜索"天气"和"股票"

2. 提前终止：
   如果工具调用明确（如用户直接要求调用某个工具），
   跳过中间推理步骤，直接执行
   
3. 小模型做Agent路由：
   ├─ 用7B模型做推理路由（决定调用哪个工具）
   ├─ 用大模型做最终回答（综合所有信息生成答案）
   └─ 优势：省token费用，速度快

4. 缓存工具结果：
   ├─ 对相同参数的工具调用结果缓存
   ├─ 例如：查"北京天气"的结果缓存1小时
   └─ 避免重复调用

5. 流式输出：
   ├─ 边思考边输出，减少用户等待感
   └─ 特别是最终答案生成阶段
```

---

### 技术细节

#### ReAct Agent 完整实现

```Python
// 代码块
import json
from typing import List, Dict, Callable

class Tool:
    """工具基类"""
    def __init__(self, name: str, description: str, func: Callable):
        self.name = name
        self.description = description
        self.func = func
    
    def run(self, **kwargs):
        return self.func(**kwargs)

class ReActAgent:
    """
    ReAct Agent完整实现
    
    核心循环：
    1. LLM生成Thought + Action
    2. 执行Action（调用工具）
    3. 将Observation追加到prompt
    4. 重复直到Action=finish或达到最大步数
    """
    def __init__(self, llm, tools: List[Tool], max_steps: int = 10):
        self.llm = llm
        self.tools = {t.name: t for t in tools}
        self.max_steps = max_steps
    
    def run(self, query: str) -> str:
        """执行Agent任务"""
        prompt = self._build_prompt(query)
        
        for step in range(self.max_steps):
            # 1. LLM生成下一步
            response = self.llm.generate(prompt)
            
            # 2. 解析Thought/Action/Action Input
            thought, action, action_input = self._parse_react(response)
            print(f"Step {step+1}:")
            print(f"  Thought: {thought}")
            print(f"  Action: {action}")
            print(f"  Input: {action_input}")
            
            # 3. 检查是否完成
            if action.lower() in ["finish", "answer", "done"]:
                return action_input
            
            # 4. 执行工具调用
            if action in self.tools:
                try:
                    args = json.loads(action_input) if action_input.startswith("{") else {"input": action_input}
                    observation = self.tools[action].run(**args)
                except Exception as e:
                    observation = f"工具执行失败: {e}"
            else:
                observation = f"未知工具: {action}"
            
            print(f"  Observation: {observation[:100]}...")
            
            # 5. 追加观察结果到prompt
            prompt += f"\nObservation: {observation}\nThought: "
        
        return "已达到最大步数限制，未能完成任务。"
    
    def _build_prompt(self, query: str) -> str:
        """构建ReAct prompt"""
        tools_str = "\n".join(
            f"- {t.name}: {t.description}" 
            for t in self.tools.values()
        )
        
        return f"""你是一个有帮助的AI助手。你可以使用以下工具：

{tools_str}

你必须使用以下格式回答：

Thought: 你的思考过程
Action: 工具名称
Action Input: 工具输入（JSON格式或纯文本）

观察结果会被自动添加。

当你获得足够信息后，使用以下格式给出最终答案：
Thought: 我已经获得了足够的信息
Action: finish
Action Input: 最终答案

问题：{query}

Thought: """
    
    def _parse_react(self, response: str):
        """解析LLM输出的Thought/Action/Action Input"""
        thought = ""
        action = ""
        action_input = ""
        
        lines = response.strip().split("\n")
        for line in lines:
            line = line.strip()
            if line.startswith("Thought:"):
                thought = line[8:].strip()
            elif line.startswith("Action:"):
                action = line[7:].strip()
            elif line.startswith("Action Input:"):
                action_input = line[13:].strip()
        
        return thought, action, action_input

# 示例：创建工具
def search_web(query: str) -> str:
    """模拟网页搜索"""
    # 实际中这里调用搜索API
    return f"搜索'{query}'的结果：找到了相关信息..."

def get_weather(city: str, date: str = "今天") -> str:
    """模拟天气查询"""
    return f"{city}{date}的天气：晴，25°C"

def calculate(expression: str) -> str:
    """计算器"""
    try:
        result = eval(expression)  # 注意：生产环境中不要用eval
        return str(result)
    except:
        return "计算失败"

# 创建Agent
tools = [
    Tool("search_web", "搜索互联网获取信息", search_web),
    Tool("get_weather", "查询指定城市的天气", get_weather),
    Tool("calculate", "计算数学表达式", calculate),
]

# agent = ReActAgent(llm=your_llm, tools=tools)
# result = agent.run("北京今天天气怎么样？如果气温低于10度提醒我穿外套")
# print(f"最终答案: {result}")
```

---

### 实际案例

**案例1：OpenAI Agents SDK**

OpenAI在2025年发布了官方Agent SDK，支持：

- **Guardrails（安全护栏）**：自动检查输入和输出是否安全
- **Handoffs（任务交接）**：一个Agent可以把任务交给另一个Agent
- **Tool Use（工具使用）**：支持Function Calling和MCP
- **Tracing（追踪）**：完整的执行链路追踪

**案例2：Claude的MCP生态**

Anthropic的Claude通过MCP协议连接了各种工具：

- 文件系统：读写本地文件
- GitHub：查看代码、创建PR
- 数据库：查询SQL
- 搜索引擎：网络搜索
- Slack：发送消息

用户只需安装对应的MCP Server，Claude就能自动使用这些工具。

**案例3：LangChain/LangGraph**

LangChain是最流行的开源Agent框架，提供了：

- 工具注册表
- 记忆管理（短期+长期记忆）
- 链式推理
- LangGraph：基于图的多Agent协作

---

### 常见误区

**❌ 误区1：Agent就是"更强的模型"**
Agent不是模型本身，而是"模型+工具+推理循环"的系统工程。一个7B模型+好的Agent框架，可能比100B模型直接对话更有效。

**❌ 误区2：Agent步数越多越好**
每一步都有延迟和成本。10步以上的Agent用户体验很差。好的Agent设计应该在3-5步内完成任务。

**❌ 误区3：MCP取代了Function Calling**
MCP和Function Calling是互补的。Function Calling是模型层面的能力（模型知道怎么调用工具），MCP是协议层面的标准（工具怎么被暴露给模型）。

**❌ 误区4：Agent不需要评估**
Agent需要专门的评估（如AgentBench、ToolBench）。一个好的对话模型不一定是好的Agent模型——Agent需要更强的工具使用能力和推理能力。

---

### 与其他知识点的关系

```
// 代码块
前驱：
  第19天 RAG基础（RAG是Agent获取知识的方式之一）
  → 第26天 推理框架（Agent需要低延迟推理）
  → 第21天 RAG评估（Agent也需要评估）

后续：
  → 第29天 数据工程（Agent训练需要高质量数据）
  → 第30天 生态全景（Agent是当前最热的发展方向）

横向：
  第25天 多模态（视觉Agent是Agent的重要方向）
  第18天 RLHF（Agent安全需要对齐）
```

---

### 为什么重要

Agent是**大模型应用的下一个爆发点**：

- **从对话到行动**：不再只是聊天，而是能完成具体任务
- **工具生态**：MCP协议让任何工具都能被Agent调用
- **推理成本**：Agent每轮多调用一次LLM，推理优化直接影响成本
- **竞争格局**：OpenAI、Anthropic、Google都在Agent赛道投入巨大

**关键认知**：Agent不是"更强的模型"，而是"模型+工具+推理循环"的系统工程。模型能力只是Agent能力的一部分。

---

### 小练习

**练习1**：设计一个Agent来解决以下任务："帮我查找2024年票房最高的电影，并告诉我它的导演还拍过哪些电影。"

**答案提示**：

```
// 代码块
Thought: 需要查找2024年票房最高的电影
Action: search_web
Action Input: "2024年票房最高电影"
Observation: 2024年票房最高的是《死侍与金刚狼》
Thought: 需要查找这部电影的导演
Action: search_web
Action Input: "死侍与金刚狼 导演"
Observation: 导演是肖恩·利维
Thought: 需要查找肖恩·利维还拍过哪些电影
Action: search_web
Action Input: "肖恩·利维 导演作品"
Observation: 《博物馆奇妙夜》《降临》《失控玩家》等
Thought: 信息收集完毕
Action: finish
Action Input: "2024年票房最高的是《死侍与金刚狼》，导演肖恩·利维还拍过《博物馆奇妙夜》《降临》《失控玩家》等"
```

**练习2**：解释MCP协议相比Function Calling的优势，并给出一个MCP比Function Calling更适合的场景。

**答案提示**：MCP的优势在于标准化和解耦。场景：一家公司有10个不同的工具（数据库、文件系统、搜索等），需要支持3个不同的LLM（GPT-4、Claude、Qwen）。用Function Calling需要为每个模型单独写工具适配代码（3×10=30个适配器）。用MCP只需要写10个MCP Server，3个模型都能用（10个Server）。

---

### 延伸阅读

- [ReAct论文](https://arxiv.org/abs/2210.03629) — 推理+行动的开创性工作
- [MCP协议文档](https://modelcontextprotocol.io/) — 模型上下文协议
- [LangChain Agent文档](https://python.langchain.com/docs/concepts/agents/) — 开源Agent框架
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) — OpenAI官方Agent框架

---
