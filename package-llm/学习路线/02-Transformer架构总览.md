# 第2天：Transformer 架构总览—— Encoder-Decoder、Self-Attention、FFN、残差连接、LayerNorm

**一句话总结**：Transformer用一个统一的注意力机制替代了RNN的循环结构，实现了全局依赖建模和完全并行计算，是当前所有大模型的底层骨架。

**前置知识**：第1天（什么是大模型、语言模型的概念）、基础的线性代数（矩阵乘法）、全连接神经网络。

---

### 核心概念

#### 1.1 RNN vs Transformer：两种处理序列的方式

在Transformer出现之前，处理序列数据（如文本）的主流方法是**RNN（循环神经网络）**。

##### RNN的工作方式

```
// 代码块
时间步 t=1: 输入"今" → 隐藏状态 h1 → 输出
时间步 t=2: 输入"天" + 隐藏状态h1 → 隐藏状态 h2 → 输出
时间步 t=3: 输入"天" + 隐藏状态h2 → 隐藏状态 h3 → 输出
时间步 t=4: 输入"气" + 隐藏状态h3 → 隐藏状态 h4 → 输出
```

RNN像一个**流水线工人**——每次只处理一个物品，把结果传给下一个工人。

**优点**：能处理任意长度的序列
**致命缺点**：

1. **无法并行**：必须等前一个词处理完才能处理下一个
2. **长距离依赖问题**：处理第100个词时，第1个词的信息可能已经丢失

##### Transformer的工作方式

```
// 代码块
输入: ["今", "天", "天", "气"]
          │
          ▼
  ┌───┬───┬───┬───┐
  │   │   │   │   │  ← 所有词同时处理
  │   │   │   │   │  ← Self-Attention：每个词"看到"所有其他词
  │   │   │   │   │  ← FFN：独立处理每个词
  └───┴───┴───┴───┘
          │
          ▼
  输出: ["今天", "天气"]
```

Transformer像一个**会议主持人**——把所有参会者同时叫到一起，每个人都能听到其他人的发言。

**关键洞察**：Self-Attention让每个词都能直接"看到"序列中的其他所有词，不再需要逐个传递信息。

#### 1.2 Transformer的完整架构

Transformer由两部分组成：**Encoder（编码器）** 和 **Decoder（解码器）**。

```
// 代码块
输入序列
   │
   ▼
  ┌─────────┐
  │ Embedding │  ← 词嵌入（把词变成向量）
  │ + Pos Enc │  ← 位置编码（告诉模型词的位置）
  └─────────┘
   │
   ▼
  ┌─────────────────────────────┐
  │         Encoder Stack         │
  │  ┌─────────────────────────┐  │
  │  │   Multi-Head Self-Attn   │  │
  │  │   + Add & LayerNorm      │  │
  │  │   + FFN (前馈网络)        │  │
  │  │   + Add & LayerNorm      │  │
  │  └─────────────────────────┘  │
  │  ┌─────────────────────────┐  │
  │  │   Multi-Head Self-Attn   │  │
  │  │   + Add & LayerNorm      │  │
  │  │   + FFN                  │  │
  │  │   + Add & LayerNorm      │  │
  │  └─────────────────────────┘  │
  │  ... (N层重复)              │  │
  └─────────────────────────────┘
   │
   ▼
  ┌─────────────────────────────┐
  │         Decoder Stack         │
  │  ┌─────────────────────────┐  │
  │  │ Masked MHSA (防偷看)      │  │
  │  │ + Add & LayerNorm        │  │
  │  │ + Cross-Attention         │  │
  │  │   (用Encoder输出作为K,V)  │  │
  │  │ + Add & LayerNorm        │  │
  │  │ + FFN                    │  │
  │  │ + Add & LayerNorm        │  │
  │  └─────────────────────────┘  │
  │  ... (N层重复)              │  │
  └─────────────────────────────┘
   │
   ▼
  线性层 + Softmax
   │
   ▼
  输出概率分布
```

**但**——GPT系列（GPT-3、GPT-4等）**只用了Decoder部分**！为什么？

因为GPT的目标是**自回归生成**（看到前面的词，预测下一个词）。Decoder的Masked Self-Attention天然适合这种"只能看前面"的任务。

而BERT（双向语言模型）只用了Encoder部分，因为它需要同时利用前后文信息来理解词义。

#### 1.3 六大核心组件详解

##### 组件1：词嵌入（Embedding）

**作用**：把离散的token（整数）变成连续的向量。

```Python
// 代码块
import torch
import torch.nn as nn

# 词嵌入层：vocab_size=30000, d_model=768
embed = nn.Embedding(30000, 768)

# 输入: [batch_size, seq_len] = [2, 5]
input_ids = torch.tensor([
    [100, 200, 300, 400, 500],
    [150, 250, 350, 450, 550]
])

# 输出: [batch_size, seq_len, d_model] = [2, 5, 768]
embeddings = embed(input_ids)
print(f"Embedding shape: {embeddings.shape}")
```

每个token变成一个768维的向量。

##### 组件2：位置编码（Positional Encoding）

**为什么需要？** Transformer没有RNN的循环结构，不知道词的顺序。

想象一下：如果你把所有词的顺序打乱，Transformer对每个词的**处理是独立的**（在Self-Attention之前），所以输出会完全一样——因为它不知道哪个词排第几位。

**方法**：把位置编码向量加到词嵌入向量上：

$$\text{Input} = \text{Embedding}(w_i) + \text{PE}(i)$$

其中 $i$ 是词在序列中的位置。

位置编码的具体方法我们会在第7天详细讲解。

##### 组件3：Self-Attention（自注意力）

这是第3天的专题——先给一个简要概述。

Self-Attention的核心思想：**每个词同时关注序列中所有其他词，根据相关性加权聚合信息**。

公式：

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

**Q（Query）**：我在找什么
**K（Key）**：我能提供什么
**V（Value）**：我实际包含什么

##### 组件4：FFN（前馈网络）

每个Transformer层里，Self-Attention之后还有一个**全连接前馈网络**。

```
// 代码块
FFN(x) = SwiGLU(xW_1 + b_1)W_2 + b_2
```

**为什么需要FFN？** 因为Self-Attention只处理了"词之间的关系"，但没有做"词本身的非线性变换"。

类比：Self-Attention像是**开会讨论**（词之间互相交流），FFN像是**每个人回去独自思考**（对收到的信息做非线性处理）。

**具体结构**：

1. 先经过一个线性变换，维度从 `d_model` → `4*d_model`（扩大4倍）
2. 经过SwiGLU激活函数
3. 再经过一个线性变换，维度从 `4*d_model` → `d_model`（恢复原尺寸）

**参数量**：FFN部分通常是大模型中**参数量最大的部分**。

例如，一个4096维的模型（如LLaMA-2 70B）：

- Self-Attention：4096×4096×4（Q/K/V+输出投影）= 约6700万参数
- FFN：4096×16384 + 16384×4096 = 约1.34亿参数

FFN的参数量是Self-Attention的约2倍！

##### 组件5：残差连接（Residual Connection）

**核心思想**：不是直接传递输出，而是"原始输入 + 处理结果"。

```
// 代码块
output = LayerNorm(x + SubLayer(x))
```

类比：**调节水温时不是"重新调一杯"，而是在原基础上加减几度**。

**为什么需要？**

1. **缓解梯度消失**：深层网络中，梯度从最后一层传回第一层时会指数级缩小。残差连接提供了**梯度高速公路**——梯度可以直接从深层跳到浅层。
2. **学习恒等映射**：如果某个层不需要改变输入，残差连接可以让它学习"什么都不做"（输出为0）。

```Python
// 代码块
def residual_block(x, sub_layer):
    """残差连接的基本结构"""
    sub_output = sub_layer(x)    # 子层处理
    return x + sub_output        # 原始输入 + 处理结果
```

##### 组件6：Layer Normalization

**作用**：对每个样本的特征维度做归一化，使训练更稳定。

```
// 代码块
LayerNorm(x) = γ · (x - μ) / √(σ² + ε) + β
```

其中：

- $μ$ 是该样本所有特征的均值
- $σ$ 是该样本所有特征的标准差
- $γ$ 和 $β$ 是可学习的缩放和平移参数
- $ε$ 是极小值，防止除以0

**为什么不用BatchNorm？**

BatchNorm是对**批次维度**做归一化，但文本序列长度可变，不同样本的特征维度不同。LayerNorm对**每个样本独立**做归一化，不受批次大小和序列长度影响。

**类比**：BatchNorm像是"全班同学统一打分"（依赖批次），LayerNorm像是"每个人自己调整分数"（独立处理）。

#### 1.4 一个完整的Transformer Layer

```
// 代码块
输入 x
  │
  │── Self-Attention层
  │   Q = xW_Q, K = xW_K, V = xW_V
  │   Attention = softmax(QK^T/√d_k)V
  │   output1 = LayerNorm(x + Attention)  ← 残差连接
  │
  │── FFN层
  │   hidden = SwiGLU(output1 × W_1)
  │   output2 = LayerNorm(output1 + hidden)  ← 残差连接
  │
  ▼
  输出 output2
```

**关键设计模式**：每个子层（Self-Attention和FFN）都被包裹在"残差连接 + LayerNorm"的结构中。这就是所谓的**Post-LayerNorm**（Post-LN）结构。

**注意**：原始Transformer用的是Post-LN，但GPT-2和LLaMA等后来的模型改成了**Pre-LayerNorm**（把LayerNorm放在残差连接之前）。Pre-LN能更好地稳定训练，是大模型的标准配置。

---

### 技术细节

#### 2.1 完整的Transformer Block代码

```Python
// 代码块
import torch
import torch.nn as nn
import torch.nn.functional as F

class SwiGLU(nn.Module):
    """SwiGLU激活函数（常用于大模型，如LLaMA）"""
    def __init__(self, dim_in, dim_out):
        super().__init__()
        self.w1 = nn.Linear(dim_in, dim_out)
        self.w2 = nn.Linear(dim_in, dim_out)
        self.w3 = nn.Linear(dim_out, dim_out)
    
    def forward(self, x):
        # SwiGLU(x) = SiLU(w1(x)) * w2(x)
        return F.silu(self.w1(x)) * self.w2(x)

class TransformerBlock(nn.Module):
    """完整Transformer Block（Pre-LayerNorm版本）"""
    def __init__(self, d_model=4096, n_heads=32, d_ff=16384, dropout=0.1):
        super().__init__()
        
        # 参数说明（以LLaMA-2 70B为例）
        # d_model = 4096: 每个token的向量维度
        # n_heads = 32: 注意力头数，每头维度=4096/32=128
        # d_ff = 16384: FFN中间层维度（= d_model × 4）
        
        # Self-Attention
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True, dropout=dropout)
        
        # Layer Normalization（Pre-LN：放在残差连接之前）
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        
        # FFN（前馈网络）
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),           # 高斯误差线性单元（大模型常用）
            nn.Linear(d_ff, d_model)
        )
        
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        """前向传播"""
        
        # === 第一步：Self-Attention ===
        # Pre-LN：先归一化，再做注意力
        attn_input = self.norm1(x)
        attn_out, _ = self.attn(attn_input, attn_input, attn_input, attn_mask=mask)
        # 残差连接：原始输入 + 注意力输出
        x = x + self.dropout(attn_out)
        
        # === 第二步：FFN ===
        # Pre-LN：先归一化，再做FFN
        ffn_input = self.norm2(x)
        ffn_out = self.ffn(ffn_input)
        # 残差连接：原始输入 + FFN输出
        x = x + self.dropout(ffn_out)
        
        return x

# 使用示例
model = TransformerBlock(d_model=768, n_heads=12, d_ff=3072)

# 模拟输入：batch_size=2, seq_len=10, d_model=768
x = torch.randn(2, 10, 768)
output = model(x)

print(f"输入 shape: {x.shape}")
print(f"输出 shape: {output.shape}")  # 和输入一样！
print(f"参数量: {sum(p.numel() for p in model.parameters()):,}")
```

**每个Transformer Block的参数量**：

| 组件 | 参数量（LLaMA-2 70B为例） | 说明 |
| --- | --- | --- |
| Q/K/V投影 | 4096×4096 × 3 = 5033万 | 每个头128维，32个头 |
| 输出投影 | 4096×4096 = 1678万 | 拼接所有头的输出 |
| FFN内部 | 4096×16384 × 2 = 1.34亿 | 两个线性层 |
| LayerNorm | 4096 × 2 = 8192 | 两个归一化层 |
| **总计** | **约2.01亿** | 每个Block |

LLaMA-2 70B有80个Transformer Block，加上词嵌入和输出层，总共约700亿参数。

#### 2.2 计算复杂度分析

| 架构 | 时间复杂度 | 空间复杂度 | 并行性 |
| --- | --- | --- | --- |
| RNN | O(n·d²) | O(d) | ❌ 串行 |
| Self-Attention | O(n²·d) | O(n²) | ✅ 完全并行 |

**关键洞察**：

1. **RNN是串行的**：必须按顺序处理n个token，每个token需要O(d²)计算，总时间O(n·d²)
2. **Self-Attention可以完全并行**：所有token之间的相关性可以同时计算
3. **瓶颈是n²**：序列长度的平方决定了计算量和显存占用

**为什么这对大模型训练至关重要？**

因为GPU的优势就是**并行计算**。RNN必须串行，GPU只能用一个核心，和CPU差不多快。Self-Attention可以完全并行，GPU的几千个核心可以同时工作，计算速度提升几十到几百倍。

**但是**，Self-Attention也有代价：显存占用是O(n²)。一个4096长度的序列需要存储 $4096^2 = 16.7M$ 个注意力分数，占用约64MB显存（FP16）。对于128K上下文，需要 $128000^2 = 16.38B$ 个分数，占用约61.5GB显存！

#### 2.3 为什么Transformer需要LayerNorm？

LayerNorm解决了两个关键问题：

**问题1：训练不稳定性**

深层网络中，每一层的输出都会放大或缩小上一层的输出。经过几十层后，输出值可能变得非常大或非常小，导致梯度爆炸或消失。

**问题2：内部协变量偏移（Internal Covariate Shift）**

每一层的输入分布随着训练过程不断变化（因为前面的层在更新参数），这导致后面的层需要不断适应新的输入分布。

**LayerNorm的解决方案**：

对每个样本的每个特征维度：

1. 减去均值（中心化）
2. 除以标准差（标准化）
3. 乘以可学习的缩放因子γ（恢复表达能力）
4. 加上可学习的偏移量β（恢复表达能力）

```Python
// 代码块
import torch

def manual_layer_norm(x, eps=1e-5):
    """手动实现LayerNorm"""
    # x: [batch, seq_len, d_model]
    mean = x.mean(dim=-1, keepdim=True)       # [batch, seq_len, 1]
    var = x.var(dim=-1, keepdim=True, unbiased=False)  # [batch, seq_len, 1]
    std = torch.sqrt(var + eps)
    x_norm = (x - mean) / std                 # 标准化
    gamma = torch.ones_like(x_norm)           # 可学习的缩放
    beta = torch.zeros_like(x_norm)           # 可学习的偏移
    return gamma * x_norm + beta

# 对比PyTorch内置实现
x = torch.randn(2, 10, 768)
manual_result = manual_layer_norm(x)
torch_result = torch.nn.functional.layer_norm(x, normalized_shape=[768])
print(f"手动实现和PyTorch结果一致: {torch.allclose(manual_result, torch_result)}")
```

---

### 实际案例

#### GPT-3的架构细节

GPT-3基于Transformer Decoder-only架构，具体配置：

| 参数 | 值 |
| --- | --- |
| 层数 | 96层 |
| 每层头数 | 96头 |
| 每头维度 | 128 |
| 模型维度 | 12288（96×128） |
| 总参数量 | 1750亿 |
| 词表大小 | 50257（Byte Pair Encoding） |
| 上下文窗口 | 2048 tokens |

GPT-3的创新不在于架构（和GPT-2几乎一样），而在于**规模**——1750亿参数，3000亿tokens的训练数据。

#### LLaMA-2的架构改进

LLaMA-2基于GPT-3的架构，做了以下改进：

1. **SwiGLU激活**：用SwiGLU替代GPT-3的ReLU，提升了非线性表达能力
2. **RMSNorm替代LayerNorm**：更简单高效的归一化方法
3. **RoPE旋转位置编码**：替代了原始Transformer的正弦位置编码
4. **GQA（分组查询注意力）**：将K和V头数从32减少到4，显存占用大幅降低

---

### 常见误区

**误区1：Transformer只能做生成任务**

**事实**：Transformer的Encoder部分（如BERT）非常适合文本理解任务。GPT系列只做生成是因为它们只用了Decoder部分。

**误区2：Self-Attention的计算量很小**

**事实**：Self-Attention的时间复杂度是O(n²·d)。当序列长度n很大时（如128K），计算量是 $128000^2 \times d$，非常恐怖。这也是为什么长上下文模型需要大量显存。

**误区3：RNN已经完全被淘汰了**

**事实**：RNN在处理非常长的序列时仍然有优势（O(n)显存 vs O(n²)显存）。Mamba等新的State Space Model（SSM）就是受RNN启发，结合了Transformer和RNN的优点。

**误区4：LayerNorm和BatchNorm没区别**

**事实**：BatchNorm对批次维度归一化，LayerNorm对特征维度归一化。在NLP中，因为序列长度可变，BatchNorm会导致归一化不稳定。LayerNorm对每个样本独立处理，更稳定。

---

### 与其他知识点的关系

| 知识点 | 关系 |
| --- | --- |
| 第1天：什么是大模型 | Transformer是大模型的**底层骨架** |
| 第3天：Self-Attention | 是Transformer的**核心子模块** |
| 第7天：位置编码 | 是Transformer的**关键组件** |
| 第4天：预训练 | 大模型在Transformer架构上**进行预训练** |
| 第6天：分布式训练 | Transformer的并行性使其适合大规模分布式训练 |

---

### 为什么重要

Transformer是过去7年AI领域最重要的架构创新。几乎所有大模型（GPT、BERT、LLaMA、ChatGPT）都基于Transformer。

**核心原因**：Transformer的Self-Attention可以**完全并行化**，完美匹配GPU的并行计算能力。RNN虽然是更早的序列模型，但因为必须串行计算，无法充分利用GPU。

理解Transformer等于理解了大模型的"DNA"。

---

### 小练习

#### 练习1：计算Transformer Block的参数量

假设一个Transformer Block的参数为：d_model=768, n_heads=12, d_ff=3072。

1. Q/K/V投影的参数量是多少？
2. 输出投影的参数量是多少？
3. FFN的参数量是多少？
4. 总参数量是多少？

#### 练习2：理解残差连接

如果某个Transformer层不需要改变输入（即学习恒等映射），残差连接如何帮助实现这一点？

---

### 延伸阅读

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - 原始论文
- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) - Jay Alammar
- [Transformer详解](https://zhuanlan.zhihu.com/p/604850536) - 知乎

---
