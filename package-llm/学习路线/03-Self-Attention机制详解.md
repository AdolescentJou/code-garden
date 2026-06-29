# 第3天：Self-Attention 机制详解—— Q/K/V矩阵、缩放点积注意力、多头注意力

**一句话总结**：Self-Attention是Transformer的"灵魂"，让模型能直接计算序列中任意两个位置的相关性，替代了RNN的逐步传递。

**前置知识**：矩阵乘法、点积运算、第2天Transformer架构总览、基础线性代数。

---

### 核心概念

#### 1.1 为什么需要Self-Attention？

考虑这句话："The animal didn't cross the street because **it** was too tired."

这里的"it"指的是什么？动物还是街道？

人类一眼就知道"it"指"animal"——因为动物才会累。但对机器来说，怎么让它知道？

**RNN的做法**：逐词处理，把"animal"的信息存在隐藏状态中，传到"it"的位置。但经过这么多步传递，信息可能已经模糊了。

**Self-Attention的做法**：当处理"it"时，直接让它和句子中所有词计算相关性。模型会发现"it"和"animal"的相关性最高（因为"tired"和"animal"语义关联强），所以从"animal"中提取最多的信息。

#### 1.2 Q/K/V三个角色

Self-Attention借鉴了信息检索（搜索引擎）的思想。

想象你去图书馆找书：

- **Query（查询）**：你心里的"我想找什么"——比如"Python编程入门"
- **Key（键）**：每本书的标签/书名——比如"Python编程：从入门到实践"
- **Value（值）**：书的实际内容

搜索引擎会计算你的Query和每本书的Key的匹配程度，根据匹配程度从对应的Value中提取信息。

在Self-Attention中：

- **Query（查询）**：当前词的"兴趣"——我在找什么信息？
- **Key（键）**：其他词的"标签"——我能提供什么信息？
- **Value（值）**：其他词的"实际内容"——我具体包含什么？

**每个词同时扮演三个角色**：既是Query的来源（找信息），又是Key的来源（提供标签），还是Value的来源（提供内容）。

#### 1.3 缩放点积注意力公式

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

**逐步理解**：

1. **计算分数**：`Q @ K^T` → 得到n×n矩阵
  - 每个元素 $s_{ij} = q_i \cdot k_j$ 表示第i个词对第j个词的关注程度
  - 点积越大，两个词越相关

1. **缩放**：除以 $\sqrt{d_k}$
  - 防止点积值过大（当d_k较大时，点积的方差随d_k增大而增大）
  - 如果值太大，softmax会进入饱和区域，梯度接近0，训练不稳定

1. **归一化**：softmax → 每行的注意力权重之和为1
  - 把分数变成概率分布
  - 每个词对其他所有词的关注权重之和为1

1. **加权求和**：权重 × V → 上下文感知的新表示
  - 根据关注权重从每个词的Value中提取信息
  - 关注权重高的词贡献更多信息

#### 1.4 为什么需要缩放（Scaling）？

这是一个容易被忽略但很重要的细节。

**问题**：当 $d_k$（Key向量维度）较大时，点积 $Q \cdot K$ 的值会很大。

**数学推导**：假设 $Q$ 和 $K$ 的每个元素都是独立同分布的，均值为0，方差为1。那么点积 $Q \cdot K = \sum_{i=1}^{d_k} q_i k_i$ 的方差为 $d_k$。

当 $d_k = 128$ 时，点积的标准差是 $\sqrt{128} \approx 11.3$。这意味着点积值很可能达到几十甚至上百。

**后果**：softmax函数在输入值很大时进入**饱和区域**——最大值的概率接近1，其他接近0。此时梯度几乎为0，训练无法进行。

**解决方案**：除以 $\sqrt{d_k}$，把方差从 $d_k$ 缩放到1：

$$\text{scaled\_score} = \frac{Q \cdot K}{\sqrt{d_k}}$$

当 $d_k = 128$ 时，除以 $\sqrt{128} \approx 11.3$，把点积值控制在合理范围。

#### 1.5 多头注意力（Multi-Head Attention）

**为什么要多头？**

单头注意力只能学习一种"关注模式"。但语言中的关系是多维度的：

- "it" → "animal"（指代关系）
- "tired" → "animal"（因果关系）
- "street" → "cross"（动作对象关系）

**多头注意力**让模型同时从多个角度关注不同的信息：

```
// 代码块
MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O
where head_i = Attention(QW_i^Q, KW_i^K, VW_i^V)
```

类比：同时用多个搜索引擎搜同一个问题，每个"头"关注不同的信息维度，最后合并所有结果。

**具体过程**：

1. 把Q、K、V分别投影到h个不同的子空间
2. 每个子空间独立做Attention
3. 把所有头的输出拼接起来
4. 通过一个线性变换融合所有头的信息

**常用配置**：

| 模型 | d_model | 头数h | 每头d_k |
| --- | --- | --- | --- |
| BERT-Base | 768 | 12 | 64 |
| GPT-3 | 12288 | 96 | 128 |
| LLaMA-2 70B | 4096 | 32 | 128 |
| LLaMA-3 405B | 12288 | 96 | 128 |

**关键洞察**：每个头的维度 $d_k = d_{model} / h$。头数越多，每个头的维度越小，能捕捉的模式越多但每个模式的表达能力越弱。

---

### 技术细节

#### 2.1 完整的Self-Attention代码实现

```Python
// 代码块
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

def scaled_dot_product_attention(Q, K, V, mask=None):
    """缩放点积注意力
    
    参数:
        Q: [batch, n_heads, seq_len, d_k] - 查询矩阵
        K: [batch, n_heads, seq_len, d_k] - 键矩阵
        V: [batch, n_heads, seq_len, d_k] - 值矩阵
        mask: [batch, 1, seq_len, seq_len] 或 None
    
    返回:
        output: 加权聚合后的输出
        attn_weights: 注意力权重矩阵（可用于可视化）
    """
    d_k = Q.size(-1)
    
    # 第1步：计算分数矩阵 Q @ K^T
    # [batch, n_heads, seq_len, d_k] × [batch, n_heads, d_k, seq_len]
    # = [batch, n_heads, seq_len, seq_len]
    scores = torch.matmul(Q, K.transpose(-2, -1))
    
    # 第2步：缩放（除以√d_k）
    scores = scores / math.sqrt(d_k)
    
    # 第3步：应用mask（如果有）
    # mask=0的位置设为-inf，softmax后变为0
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))
    
    # 第4步：softmax归一化
    # 每行（每个query对所有key的注意力）之和为1
    attn_weights = F.softmax(scores, dim=-1)
    
    # 第5步：加权求和
    # [batch, n_heads, seq_len, seq_len] × [batch, n_heads, seq_len, d_k]
    # = [batch, n_heads, seq_len, d_k]
    output = torch.matmul(attn_weights, V)
    
    return output, attn_weights


class MultiHeadAttention(nn.Module):
    """完整的多头注意力实现"""
    def __init__(self, d_model=768, num_heads=12, dropout=0.1):
        super().__init__()
        assert d_model % num_heads == 0, "d_model必须能被num_heads整除"
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads  # 每个头的维度
        
        # 4个线性变换：Q/K/V投影 + 输出投影
        self.W_Q = nn.Linear(d_model, d_model)
        self.W_K = nn.Linear(d_model, d_model)
        self.W_V = nn.Linear(d_model, d_model)
        self.W_O = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, mask=None):
        """
        参数:
            x: [batch, seq_len, d_model]
            mask: [batch, 1, seq_len, seq_len] 或 None
        
        返回:
            output: [batch, seq_len, d_model]
        """
        batch_size, seq_len, _ = x.shape
        
        # 第1步：投影到Q/K/V
        Q = self.W_Q(x)  # [batch, seq_len, d_model]
        K = self.W_K(x)
        V = self.W_V(x)
        
        # 第2步：分头
        # [batch, seq_len, d_model] → [batch, seq_len, num_heads, d_k]
        # → [batch, num_heads, seq_len, d_k]
        Q = Q.view(batch_size, seq_len, self.num_heads, self.d_k).transpose(1, 2)
        K = K.view(batch_size, seq_len, self.num_heads, self.d_k).transpose(1, 2)
        V = V.view(batch_size, seq_len, self.num_heads, self.d_k).transpose(1, 2)
        
        # 第3步：计算注意力
        attn_out, attn_weights = scaled_dot_product_attention(Q, K, V, mask)
        
        # 第4步：合并所有头
        # [batch, num_heads, seq_len, d_k] → [batch, seq_len, num_heads, d_k]
        # → [batch, seq_len, d_model]
        attn_out = attn_out.transpose(1, 2).contiguous()
        attn_out = attn_out.view(batch_size, seq_len, self.d_model)
        
        # 第5步：输出投影
        output = self.W_O(attn_out)
        
        return output, attn_weights


# 可视化注意力权重
def visualize_attention(attn_weights, tokens):
    """用文字方式可视化注意力权重"""
    seq_len = len(tokens)
    print("\n注意力权重矩阵（每行是当前词对其他词的关注程度）:")
    print("        " + "  ".join(f"{t:>6}" for t in tokens))
    
    for i, token in enumerate(tokens):
        row = attn_weights[0, 0, i, :].tolist()  # 取第一个batch第一个头
        formatted = "  ".join(f"{w:.4f}" for w in row)
        print(f"{token:>6}  {formatted}")


# 示例：模拟注意力计算
mha = MultiHeadAttention(d_model=64, num_heads=4)
tokens = ["The", "cat", "sat", "on", "the", "mat"]
x = torch.randn(1, len(tokens), 64)

output, weights = mha(x)
print(f"输入 shape: {x.shape}")
print(f"输出 shape: {output.shape}")
print(f"注意力权重 shape: {weights.shape}")  # [1, 4, 6, 6]
print(f"每行权重之和: {weights[0, 0, 0, :].sum().item():.4f}")  # 应该≈1.0
```

#### 2.2 计算复杂度详细分析

| 操作 | 时间复杂度 | 说明 |
| --- | --- | --- |
| 投影Q/K/V | O(n·d²) | 每个token通过线性变换 |
| Q·K^T | O(n²·d) | **瓶颈**——n×n矩阵 |
| Softmax | O(n²) | 每行做softmax |
| Attention·V | O(n²·d) | 加权聚合 |

总复杂度：**O(n²·d + n·d²)**

当n > d时（长序列），**n²是主要瓶颈**；当d > n时（短序列但大模型），**d²是主要瓶颈**。

**实际数字**（LLaMA-2 70B, n=4096, d=4096）：

- Q·K^T: $4096^2 \times 4096 = 687$亿次浮点运算
- Attention·V: 同上
- 总计每层Attention: 约1.37万亿次浮点运算

对于128K上下文：

- $128000^2 \times 4096 = 6.7 \times 10^{16}$ 次浮点运算
- 比4096上下文多了 **1000倍**！

这就是为什么长上下文模型的计算成本非常高。

#### 2.3 因果注意力（Causal Attention / Masked Attention）

GPT等自回归模型使用**因果注意力**——每个词只能看到它前面的词，不能"偷看"后面的词。

实现方式：在注意力分数矩阵上应用一个**下三角mask**：

```
// 代码块
Mask矩阵（1=可见, 0=屏蔽）:
      位置1  位置2  位置3  位置4
位置1 [  1,     0,     0,     0  ]
位置2 [  1,     1,     0,     0  ]
位置3 [  1,     1,     1,     0  ]
位置4 [  1,     1,     1,     1  ]
```

```Python
// 代码块
def create_causal_mask(seq_len):
    """创建因果mask"""
    mask = torch.tril(torch.ones(seq_len, seq_len))  # 下三角矩阵
    return mask.unsqueeze(0).unsqueeze(0)  # [1, 1, seq_len, seq_len]

mask = create_causal_mask(4)
print(mask)
# tensor([[[[1., 0., 0., 0.],
#            [1., 1., 0., 0.],
#            [1., 1., 1., 0.],
#            [1., 1., 1., 1.]]]])
```

---

### 实际案例

#### GPT-4中的注意力机制

GPT-4使用了一种改进的多头注意力——**分组查询注意力（GQA, Grouped-Query Attention）**：

- **传统MHA**：每个头都有独立的Q、K、V
- **MQA**：所有头共享一组K、V（显存大幅减少，但性能下降）
- **GQA**：把头分成若干组，组内共享K、V（平衡性能和显存）

```
// 代码块
MHA:  Q1 K1 V1 | Q2 K2 V2 | Q3 K3 V3 | ...  每头独立
MQA:  Q1 K  V  | Q2 K  V  | Q3 K  V  | ...  全部共享
GQA:  Q1 K1 V1 | Q2 K1 V1 | Q3 K2 V2 | Q4 K2 V2  分组共享
```

LLaMA-2 70B使用GQA，K/V头数从32减少到4，显存占用减少约8倍。

#### 注意力可视化

虽然我们无法插入图片，但可以用文字描述注意力模式：

在处理"The cat sat on the mat because **it** was tired"时：

```
// 代码块
"it"的注意力分布:
  The:   0.02  (不关注)
  cat:   0.45  (最关注! 因为"it"指代"cat")
  sat:   0.05  (轻微关注)
  on:    0.02  (不关注)
  the:   0.03  (不关注)
  mat:   0.08  (轻微关注)
  it:    0.15  (关注自身)
  was:   0.10  (关注后续词)
  tired: 0.10  (关注语义相关词)
```

模型学会了"it"指代"cat"——这正是Self-Attention的威力。

---

### 常见误区

**误区1：每个头学习不同的语义关系**

**事实**：研究发现很多注意力头是冗余的——它们学到了相似的注意力模式。这也是GQA/MQA能work的原因。

**误区2：注意力权重越高，两个词的关系越"强"**

**事实**：注意力权重只是模型的一种内部计算机制，不直接对应人类的"语义关联"概念。高权重可能只是因为模型需要从那个位置提取特定信息。

**误区3：Self-Attention的时间复杂度是O(n)**

**事实**：是O(n²·d)，因为需要计算所有n×n对的相关性。这是长文本处理的主要瓶颈。

---

### 与其他知识点的关系

- 第2天：Self-Attention是Transformer的**核心子模块**
- 第7天：位置编码直接作用于Self-Attention的Q/K计算
- 第6天：Self-Attention中的矩阵乘法是**混合精度训练**的主要应用场景

---

### 为什么重要

Self-Attention是Transformer的核心创新，也是大模型能处理长文本、理解复杂语义的根基。几乎所有现代NLP模型的注意力变体和优化都围绕这个机制展开。

---

### 小练习

**练习1**：在缩放点积注意力中，如果不除以 $\sqrt{d_k}$ 会怎样？用一个具体例子说明。

**练习2**：为什么GQA（分组查询注意力）能减少显存而几乎不影响性能？

---

### 延伸阅读

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)

---
