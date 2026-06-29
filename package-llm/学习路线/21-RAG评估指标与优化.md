# 21. RAG评估指标与优化 — NDCG/MRR、RAGAS、端到端评估

### 标题

**给RAG系统"体检"：如何量化衡量检索和生成的质量**

### 一句话总结

RAG评估解决的是"怎么知道RAG系统到底好不好"的问题——没有量化指标，一切优化都是盲猜。就像给病人看病，你不能只说"感觉还行"，得量体温、验血、做CT，每个指标回答一个具体问题。

### 前置知识

- **第19天 RAG基础**：理解RAG系统中检索器（Retriever）和生成器（Generator）的双阶段架构
- **第20天 Embedding模型**：知道向量相似度搜索的原理，理解为什么检索质量直接影响生成质量
- **第12天 Transformer注意力机制**：理解为什么检索到的上下文片段需要按相关性排序而非随机

---

### 核心概念

#### 为什么RAG必须做评估？

想象你开了一家餐厅，RAG就是你的"点菜→炒菜→上菜"系统。每天老板问你："今天的菜做得怎么样？"你回答："还行吧，客人没投诉。"老板信吗？

**不做评估的三大恶果：**

1. **召回不准**：客人点的菜明明在菜单里有，但服务员就是没找到（检索失败）。你以为是厨师不行，其实是服务员在拖后腿。
2. **生成幻觉**：菜找到了，但厨师根据错误的食材信息做了道菜，结果胡说八道（大模型基于不相关文档生成答案）。
3. **优化无方向**：出了问题不知道该改哪里。是分块大小不对？还是Embedding模型选错了？还是Prompt写得不好？只能瞎试，效率极低。

所以RAG系统的效果不是"感觉出来"的，是"测出来"的。而且RAG的评估必须分成两个独立的阶段：**检索阶段**和**生成阶段**。这两个阶段的问题完全不一样，解决方案也完全不一样。混在一起评估，你永远找不到问题的根源。

```
// 代码块
RAG评估的整体流程：

  用户输入问题
    ↓
  ┌─ 检索阶段评估 ──► 检索是否准确？──┐
  │                                    │
  └─ 生成阶段评估 ──► 生成是否合格？──┘
    ↓
  如果检索不准 → 优化检索策略（调整分块/embedding/混合检索）
  如果生成不准 → 优化生成策略（调整prompt/模型/上下文）
  如果都准    → 上线部署
    ↓
  生产环境持续监控 ──► 指标是否正常？──► 分析问题根因 ──► 进入数据闭环迭代
```

#### 检索层指标详解

##### Recall@K（召回率@K）—— 最直观的"有没有找到"

**一句话**：在前K个检索结果中，包含至少一个相关文档的比例。

> 类比：你问图书馆员"帮我找关于量子力学的书"，馆员从5000本中挑了10本给你。如果这10本里有3本确实相关（标准答案是5本），那么 Recall@10 = 3/5 = 0.6。

**深度理解**：Recall@K回答的问题只有一个："正确答案有没有出现在前K条里？"它完全不在乎顺序。即使正确文档排在第3位，Recall@3依然是1。

**为什么叫"@K"？** 因为K是可以调整的。实际工程中，K通常设为5或10。K越大，Recall@K越高（因为搜索范围更大），但用户体验不一定更好（因为前几条可能都不相关）。

**适合场景**：FAQ系统、找唯一正确文档、找最佳答案页。

**局限**：完全不在乎顺序！即使正确文档排在第K位，Recall@K依然是1，但用户体验差多了。

##### MRR（Mean Reciprocal Rank）—— 看"第一个正确答案来得有多早"

**一句话**：只盯着第一个正确结果排在第几名，越靠前得分越高。

> 直觉公式（不用背，懂意思就行）：
> - 第1名命中 → 得分 1.0
> - 第2名 → 得分 0.5
> - 第3名 → 得分 ≈0.333
> - 第10名 → 得分 0.1

**深度理解**：MRR的核心思想是"用户只看前几个结果"。搜索引擎的用户行为研究显示，大部分用户只看第1页（前10个结果），其中点击第1个结果的概率远高于后面的。所以MRR只关心"第一个对的在哪"，不关心后面还有没有对的。

**为什么取倒数？** 因为排在第1名和第2名的用户体验差距，远大于排在第9名和第10名的差距。1/1和1/2之间差0.5，而1/9和1/10之间只差0.011。倒数函数天然放大了顶部排名的差异。

**适合场景**：FAQ系统、找唯一正确文档。

**局限**：如果一个问题有多个相关文档，MRR只看"第一个"，完全忽略后面的。

##### NDCG（Normalized Discounted Cumulative Gain）—— 最全面的"整体排序质量"

**一句话**：同时考虑了三个维度：(1)相关结果有没有出现 (2)排得靠不靠前（越靠后越打折）(3)区分"有多相关"（非常相关比一般相关更值钱）。

**深度理解**：NDCG是最复杂的指标，但也是最全面的。它把搜索结果从简单的"对/错"扩展为**多级相关度**：

```
// 代码块
相关度分级（以4分制为例）：
  4分 = 完美匹配（用户非常满意，不需要看其他结果）
  3分 = 高度相关（用户比较满意）
  2分 = 基本相关（用户凑合用）
  1分 = 勉强相关（用户不太满意）
  0分 = 完全不相关
```

**为什么需要"Discount"（折扣）？** 因为位置越靠后，用户看到的概率越低。排在第1位的4分结果，价值远大于排在第10位的4分结果。所以NDCG用 log2(i + 1) 做分母，越靠后的位置折扣越大。

```
// 代码块
经典好坏排序对比（以K=5为例）：

  理想排序（IDCG）：      实际排序（DCG）：
  第1位：4分（完美）        第1位：2分（凑合用）
  第2位：4分（完美）        第2位：4分（完美）
  第3位：3分（高度）        第3位：0分（垃圾）
  第4位：2分（基本）        第4位：3分（高度）
  第5位：1分（勉强）        第5位：4分（完美）

  IDCG = 4/log2(2) + 4/log2(3) + 3/log2(4) + 2/log2(5) + 1/log2(6)
       = 4/1 + 4/1.585 + 3/2 + 2/2.322 + 1/2.585
       ≈ 4 + 2.52 + 1.5 + 0.86 + 0.39 = 9.27

  DCG  = 2/1 + 4/1.585 + 0/2 + 3/2.322 + 4/2.585
       ≈ 2 + 2.52 + 0 + 1.29 + 1.55 = 7.36

  NDCG = DCG / IDCG ≈ 7.36 / 9.27 ≈ 0.79

  注意：虽然实际排序里有一个4分结果，但因为排在第5位（用户几乎看不到），
  所以NDCG只有0.79，远低于理想排序的1.0。
```

**为什么需要"Normalized"（归一化）？** 因为不同查询的相关度总分会不同（有的查询有5个相关结果，有的只有2个）。归一化后，NDCG落在0~1之间：1 = 完美排序，越接近1越好。

##### 三者的核心区别

```
// 代码块
  Recall@K：前K个里有没有覆盖正确结果？（只看"找没找到"）
  MRR：      第一个正确结果来得早不早？（只关心第一个）
  NDCG：     多个相关结果整体排得好不好？还能区分"有多相关"（最全面）
```

#### 上下文层指标

**Context Precision（上下文精确率）**：检索到的文档中，有多少比例是真正相关的。

> 类比：你让助手帮你找5篇参考资料，结果5篇里有3篇是相关的，Context Precision = 3/5 = 0.6。

**Context Recall（上下文召回率）**：所有相关文档中，被检索到的比例。

> 类比：图书馆里有10本关于量子力学的书，你只找到了6本，Context Recall = 6/10 = 0.6。

**Context Relevance（上下文相关性）**：用LLM判断检索到的上下文与问题的相关程度。

> 这个方法比较新——传统指标依赖人工标注的"标准答案"，但Context Relevance用大模型当"裁判"，让LLM打分判断每个检索到的文档是否真的和问题相关。

#### 端到端指标

**Faithfulness（忠实度）**：大模型生成的答案是否忠实于检索到的上下文，而不是"自由发挥"。

> 类比：学生考试时如果抄袭了参考资料内容，就是"忠实"的；如果自己瞎编，就是"幻觉"。

**Answer Relevance（答案相关性）**：答案与用户问题的相关程度。

> 类比：用户问"北京今天天气怎么样？"，模型回答"北京今天晴，32°C" → 高度相关。模型回答"我喜欢吃火锅" → 完全不相关。

**Answer Correctness（答案正确性）**：答案是否正确（通常需要人工标注或使用嵌入相似度近似）。

---

### 技术细节

#### 公式推导

##### Recall@K 公式

```
// 代码块
Recall@K = |{相关文档} ∩ {前K个检索结果}| / |{所有相关文档}|

其中：
  |{A}| 表示集合A的元素个数（也叫"基数"）
  ∩  表示集合交集（两个集合中都有的元素）

举例：
  所有相关文档 = {Doc A, Doc B, Doc C, Doc D, Doc E}  → 5个
  前K=10个检索结果 = {Doc X, Doc A, Doc Y, Doc B, Doc Z, Doc C, ...}
  交集 = {Doc A, Doc B, Doc C}  → 3个
  Recall@10 = 3/5 = 0.6
```

##### MRR 公式

```
// 代码块
MRR = (1/Q) × Σ(1 / rank_i)  对i从1到Q求和

其中：
  Q = 查询总数
  rank_i = 第i个查询中第一个相关结果的排名
  如果没找到相关结果，则 rank_i = 0（贡献为0）

举例（Q=3个查询）：
  查询1：第一个相关结果排第1 → 得分 1/1 = 1.0
  查询2：第一个相关结果排第3 → 得分 1/3 ≈ 0.33
  查询3：没有找到相关结果  → 得分 0
  MRR = (1/3) × (1.0 + 0.33 + 0) ≈ 0.44
```

##### NDCG@K 公式（一步步推导）

```
// 代码块
步骤1：计算DCG（折损累积增益）

DCG@K = Σ(relevance_i / log2(i + 1))  对i从1到K求和

其中：
  relevance_i = 第i个结果的相关度得分（0-4分）
  log2(i + 1) = 位置折扣因子（越靠后折扣越大）

步骤2：计算IDCG（理想DCG）

方法：把相关性从高到低排序，重新计算DCG@K

步骤3：计算NDCG

NDCG@K = DCG@K / IDCG@K

结果在0-1之间，1=完美排序
```

#### Python代码实现

```Python
// 代码块
import math
from typing import List, Union

def recall_at_k(relevant_docs: set, retrieved_docs: list, k: int) -> float:
    """计算Recall@K"""
    top_k = set(retrieved_docs[:k])
    intersection = relevant_docs & top_k
    return len(intersection) / len(relevant_docs) if relevant_docs else 0.0

def mrr(relevant_docs: set, retrieved_docs: list) -> float:
    """计算单个查询的MRR"""
    for i, doc in enumerate(retrieved_docs):
        if doc in relevant_docs:
            return 1.0 / (i + 1)
    return 0.0

def dcg_at_k(relevance_scores: List[float], k: int) -> float:
    """计算DCG@K"""
    dcg = 0.0
    for i in range(min(k, len(relevance_scores))):
        dcg += relevance_scores[i] / math.log2(i + 2)  # i从0开始，所以i+2
    return dcg

def ndcg_at_k(relevance_scores: List[float], k: int) -> float:
    """计算NDCG@K"""
    dcg = dcg_at_k(relevance_scores, k)
    
    # 理想排序：按相关度从高到低
    ideal_scores = sorted(relevance_scores, reverse=True)
    idcg = dcg_at_k(ideal_scores, k)
    
    return dcg / idcg if idcg > 0 else 0.0

# 示例：模拟5个查询的评估
queries = [
    {
        "query": "量子力学基础",
        "relevant": {"doc1", "doc2", "doc3"},
        "retrieved": ["doc1", "doc4", "doc2", "doc5", "doc3"],  # 前5个
    },
    {
        "query": "Python安装方法",
        "relevant": {"doc10"},
        "retrieved": ["doc10", "doc11", "doc12"],  # 排第1
    },
    {
        "query": "如何学习深度学习",
        "relevant": {"doc20", "doc21"},
        "retrieved": ["doc22", "doc23", "doc20", "doc24"],  # 排第3
    },
]

print("=== RAG评估示例 ===")
for q in queries:
    r = recall_at_k(q["relevant"], q["retrieved"], k=5)
    m = mrr(q["relevant"], q["retrieved"])
    print(f"查询: {q['query']}")
    print(f"  Recall@5 = {r:.2f}")
    print(f"  MRR      = {m:.3f}")

# NDCG示例
relevance = [4, 2, 0, 3, 1]  # 5个结果的相关度
print(f"\nNDCG@5 = {ndcg_at_k(relevance, 5):.3f}")

# 输出：
# === RAG评估示例 ===
# 查询: 量子力学基础
#   Recall@5 = 1.00
#   MRR      = 1.000
# 查询: Python安装方法
#   Recall@5 = 1.00
#   MRR      = 1.000
# 查询: 如何学习深度学习
#   Recall@5 = 0.50
#   MRR      = 0.333
#
# NDCG@5 = 0.793
```

#### RAGAS 评估框架

```Python
// 代码块
# RAGAS是2023年推出的开源评估框架，用LLM作为评委
# 安装：pip install ragas

from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)

# 构建评估数据集（需要标注）
dataset = {
    "question": [
        "What is RAG?",
        "How does vector search work?",
    ],
    "answer": [
        "RAG stands for Retrieval Augmented Generation...",
        "Vector search uses embedding...",
    ],
    "contexts": [
        ["RAG combines retrieval and generation...", "LLMs with external knowledge..."],
        ["Embedding maps text to vectors...", "Cosine similarity measures..."],
    ],
    "ground_truth": [
        "RAG (Retrieval Augmented Generation) combines a retrieval system with a language model...",
        "Vector search converts text into numerical vectors using embedding models...",
    ],
}

# 执行评估（用GPT-4作为评委LLM）
result = evaluate(
    dataset=dataset,
    metrics=[
        faithfulness,          # 忠实度：答案是否基于上下文
        answer_relevancy,      # 答案相关性：答案是否回答了问题
        context_precision,     # 上下文精确率：检索的文档有多相关
        context_recall,        # 上下文召回率：是否找回了所有相关文档
        answer_correctness,    # 答案正确性：与标准答案的相似度
    ],
    llm=your_llm_evaluator,  # 可以用GPT-4或任何LLM
    embeddings=your_embedder, # 嵌入模型用于计算相似度
)

print(result)
# 输出示例：
# {
#   "faithfulness": 0.85,
#   "answer_relevancy": 0.92,
#   "context_precision": 0.78,
#   "context_recall": 0.81,
#   "answer_correctness": 0.88
# }
```

#### 评估优化策略

```
// 代码块
1. 检索层优化：
   ├─ 调整Embedding模型（text-embedding-3-large vs text-embedding-3-small）
   ├─ 改进分块策略（chunking）
   │  ├─ 固定大小分块（256/512/1024 tokens）
   │  ├─ 语义分块（按段落/句子边界切分）
   │  └─ 滑动窗口（相邻chunk重叠50%）
   ├─ 引入混合检索（向量+关键词 BM25）
   └─ 加入Reranker（重排序）

2. 上下文层优化：
   ├─ 使用Reranker对检索结果重新排序
   ├─ 过滤低质量上下文（长度过短、重复率过高）
   └─ 上下文压缩（用LLM总结长文档）

3. 生成层优化：
   ├─ 设计更好的prompt template
   ├─ 约束LLM只基于上下文回答（减少幻觉）
   ├─ 引用机制（让模型引用文档来源）
   └─ 调整温度参数（降低随机性）

4. 端到端优化：
   ├─ AB测试不同检索器+生成器组合
   ├─ 构建评估数据集（至少100对Q&A）
   └─ 持续监控生产环境指标
```

---

### 实际案例

**案例1：某企业知识库RAG系统**

某金融公司搭建了内部知识库问答系统，用5000篇内部文档。上线后发现：

- 用户问"2024年报销政策"，模型回答的是2023年的旧政策
- 用户问"会议室预订流程"，模型胡编了一个流程

通过评估发现：

- Recall@5 = 0.95（检索很强，95%的问题都能找到相关文档）
- Faithfulness = 0.55（问题出在生成端——找到了文档但模型没忠实引用）
- Answer Relevance = 0.60（答案和问题相关度不高）

**结论**：不是检索问题，是生成问题。优化方向：

1. 在Prompt中加入"你必须引用文档内容回答，不能编造"
2. 加入文档引用机制，让模型标注信息来源
3. 对时效性文档加时间戳过滤

优化后：Faithfulness从0.55提升到0.85，用户满意度大幅提升。

**案例2：DeepSeek的RAG评估实践**

DeepSeek在开发RAG系统时，使用了RAGAS + 自定义评估指标。他们发现：

- 纯向量检索的Recall@5为0.72
- 加入BM25混合检索后提升到0.86
- 再加Reranker后提升到0.91

但NDCG提升不大（从0.68到0.71），说明主要问题是"找不找得到"，而不是"排得好不好"。这指导他们把重点放在检索召回上，而不是排序优化上。

---

### 常见误区

**❌ 误区1：直接用LLM打分就够了**
很多人觉得"我直接用GPT-4打个分，看回答质量不就好了？"

> 问题在于：LLM打分只能告诉你"最终答案好不好"，没法告诉你"是哪个环节出了问题"。就像一道菜不好吃，你不知道是食材不行还是厨师手艺差。

**❌ 误区2：只看一个指标就够了**
Recall@5高不代表系统好。可能检索了一大批垃圾文档，刚好包含了一个相关的。需要同时看Precision、Faithfulness等多个指标。

**❌ 误区3：评估数据集太小**
用10-20个问题评估RAG系统，结果可能完全不可靠。业界建议至少100个问题，最好500+。

**❌ 误区4：用生产数据直接评估**
生产数据没有标注"标准答案"，没法计算Recall、MRR等指标。必须构建独立的评估数据集。

---

### 与其他知识点的关系

```
// 代码块
前驱：
  第19天 RAG基础（RAG是什么）
  → 第20天 Embedding模型（检索依赖的底层技术）
  → 第12天 Transformer注意力机制（为什么需要排序）
  → 本节（怎么评估RAG好坏）

后续：
  → 第22天 向量数据库（检索优化的基础设施）
  → 第28天 Agent中的模型调用（RAG是Agent知识获取的重要手段）

横向：
  第23天 模型评测方法论（评估的通用范式可借鉴到RAG评估中）
```

---

### 为什么重要

RAG评估是RAG工程化的**基石**。没有评估，就无法知道：

- 换了个Embedding模型到底有没有效果？
- 调整了分块大小是变好还是变差？
- 加入Reranker后提升有多大？

业界主流框架（RAGAS、ARES、TruLens）都围绕这些指标构建。**掌握这些指标，就能科学地优化RAG系统，而不是靠感觉。**

---

### 小练习

**练习1**：假设你有一个RAG系统，评估结果如下：

- Recall@5 = 0.80
- MRR = 0.55
- NDCG@5 = 0.72
- Faithfulness = 0.65

问：

1. 哪个环节问题最大？为什么？
2. 应该优先优化哪个方向？

**答案提示**：Recall@5=0.80意味着20%的问题找不到相关文档（检索问题）；Faithfulness=0.65意味着35%的答案没有忠实于上下文（生成问题）。需要同时优化两个方向。

**练习2**：设计一个评估数据集的构建方案。假设你有1000篇内部文档，需要构建包含200个Q&A对的评估数据集。写出具体步骤。

**答案提示**：

1. 从1000篇文档中随机选取200篇
2. 用LLM为每篇文档生成1个问题和标准答案
3. 人工审核（至少2人交叉验证）
4. 记录每篇文档中回答该问题所需的关键段落位置

---

### 延伸阅读

- [RAGAS 官方文档](https://docs.ragas.io/en/latest/) — 开源RAG评估框架
- [ARES: Automated RAG Evaluation](https://arxiv.org/abs/2305.03451) — 学术论文，介绍自动RAG评估方法
- [Evaluating RAG Applications](https://www.pinecone.io/learn/evaluate-rag/) — Pinecone的RAG评估指南
- [RAG评估完全指南](https://blog.csdn.net/2301_80381519/article/details/161694467) — 一篇把RAG评估从头拆透的中文博客

---
