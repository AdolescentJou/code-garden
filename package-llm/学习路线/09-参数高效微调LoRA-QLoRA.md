# 第9天：参数高效微调（LoRA/QLoRA）—— 低秩分解原理、adapter设计、量化微调

**一句话总结**：大模型全参数微调需要上千GB显存，LoRA/QLoRA只微调0.1%-1%的参数，效果接近全参数微调，成本降低10-100倍。

**前置知识**：第2-3天（Transformer/Self-Attention）、第5天（优化器）、第8天（SFT）。

---

### 核心概念

#### 1.1 全参数微调的困境

以GPT-3 175B为例：

- 参数：175B × 4字节 = 700GB
- 梯度：700GB
- 优化器状态（AdamW）：1400GB
- **总计：2.8TB** → 需要数百个GPU，成本数百万美元

**问题**：每次微调都要更新所有参数，但真的需要吗？

#### 1.2 LoRA的核心假设

**核心假设**：大模型在适应新任务时，权重矩阵的变化量是**低秩**的。

**类比**：虽然GPT-3有1750亿参数，但为了学会"写代码"，真正起关键作用的神经元连接变化非常少。就像一个大学生学一门新课，不需要重新连接大脑中的所有神经元，只需要调整一小部分连接。

**数学表达**：

原始权重矩阵 $W_0 \in \mathbb{R}^{d \times k}$ 的更新量 $\Delta W$ 可以分解为两个低秩矩阵的乘积：

$$\Delta W = B \cdot A$$

其中 $B \in \mathbb{R}^{d \times r}, A \in \mathbb{R}^{r \times k}, r \ll \min(d, k)$

**什么是"低秩"？**

想象一个4096×4096的矩阵——它有1600万个参数。但如果这个矩阵的有效信息可以用一个4096×8和8×4096的矩阵对来表示，那只需要65536个参数——减少了256倍！

**类比**：一张高清图片有数百万像素，但JPEG压缩后可能只有几十KB——因为图片的有效信息是"低秩"的。同样的道理，大模型适应新任务时的权重变化也是低秩的。

#### 1.3 LoRA的具体实现

**前向传播**：
$$y = W_0 x + \Delta W x = W_0 x + BAx$$

**关键操作**：

1. **冻结主干**：预训练模型的所有权重 $W_0$ 锁定，不参与梯度更新
2. **旁路注入**：在每个Transformer层（通常是Attention的Q、V投影矩阵）旁边，挂载两个极小的矩阵A和B
3. **低秩分解**：r通常取4-128，远小于原始维度（如4096）
4. **初始化**：A用高斯随机初始化，B初始化为0（训练开始时 $\Delta W = 0$，不改变原始模型行为）

**参数量对比**：

以一个4096×4096的权重矩阵为例：

| 方法 | 可训练参数 | 占总参数比例 |
| --- | --- | --- |
| 全参数微调 | 1678万 | 100% |
| LoRA (r=8) | 65536 | 0.39% |
| LoRA (r=64) | 524288 | 3.1% |

**通常只加在Q和V上**：LoRA不需要加在所有矩阵上，实验证明只加在Attention的Q和V投影矩阵上效果就很好。

#### 1.4 QLoRA（Quantized LoRA）

QLoRA在LoRA基础上加了一层**4-bit量化**：

**核心创新**：

1. **4-bit NormalFloat (NF4)量化**：将权重从FP16量化到4-bit，减少75%存储
2. **双量化（Double Quantization）**：量化常数也做量化，再省15%
3. **分页优化器（Paged Optimizer）**：利用CPU内存缓解GPU显存不足

**效果**：QLoRA可以用**单张48GB显存的GPU**微调65B参数的模型！

#### 1.5 其他参数高效微调方法

| 方法 | 原理 | 特点 |
| --- | --- | --- |
| **LoRA** | 低秩矩阵旁路注入 | 最流行，通用 |
| **Adapter** | 在层间插入小型MLP | 早期方法，增加推理延迟 |
| **Prefix Tuning** | 在注意力中加入可学习的前缀 | 灵活但复杂 |
| **P-Tuning v2** | 可学习的prompt嵌入 | 简单 |

---

### 技术细节

#### 2.1 LoRA代码实现

```Python
// 代码块
import torch
import torch.nn as nn

class LoRALayer(nn.Module):
    """LoRA低秩适配器"""
    def __init__(self, in_features, out_features, rank=8, alpha=16):
        super().__init__()
        self.rank = rank
        self.alpha = alpha  # 缩放因子
        
        # 矩阵A: [rank, in_features] - 降维
        # 用高斯随机初始化
        self.A = nn.Parameter(torch.randn(rank, in_features) * 0.02)
        
        # 矩阵B: [out_features, rank] - 升维
        # 初始化为0，训练开始时ΔW=0
        self.B = nn.Parameter(torch.zeros(out_features, rank))
    
    def forward(self, x):
        # x: [batch, seq_len, in_features]
        # BAx: [batch, seq_len, out_features]
        # 注意：用alpha/rank缩放
        return (x @ self.A.T @ self.B.T) * (self.alpha / self.rank)

class LoRALinear(nn.Module):
    """将LoRA包装到线性层上"""
    def __init__(self, linear_layer, rank=8, alpha=16):
        super().__init__()
        self.linear = linear_layer  # 冻结的原始层
        
        in_features = linear_layer.in_features
        out_features = linear_layer.out_features
        
        # 创建LoRA旁路
        self.lora = LoRALayer(in_features, out_features, rank, alpha)
        
        # 冻结原始层
        for param in self.linear.parameters():
            param.requires_grad = False
    
    def forward(self, x):
        # y = W_0 x + (alpha/r) * BAx
        return self.linear(x) + self.lora(x)


# 使用HuggingFace PEFT库（生产环境推荐）
from peft import LoraConfig, get_peft_model, TaskType

config = LoraConfig(
    r=8,                              # 低秩维度
    lora_alpha=32,                    # 缩放因子（通常为2*r）
    target_modules=["q_proj", "v_proj"],  # 只作用于Q和V
    lora_dropout=0.05,                # LoRA层的dropout
    bias="none",
    task_type=TaskType.CAUSAL_LM
)

# model = get_peft_model(model, config)
# print(f"可训练参数: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")
```

#### 2.2 LoRA配置要点

| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| r（秩） | 8-64 | 越大效果越好但参数越多 |
| lora_alpha | 2×r | 缩放因子，控制LoRA输出幅度 |
| target_modules | ["q_proj", "v_proj"] | 通常只加在Q和V上 |
| lora_dropout | 0.05-0.1 | 正则化 |

**如何选择r？**

- r=4-8：简单任务（如风格迁移）
- r=16-32：中等任务（如SFT）
- r=64+：复杂任务（如领域适配）

---

### 实际案例

#### Alpaca-LoRA

Stanford的Alpaca模型用LoRA微调LLaMA-7B：

- 可训练参数：约4M（0.06%）
- 训练成本：约$100（单张RTX 4090，3小时）
- 效果：接近全参数微调

#### QLoRA微调65B模型

QLoRA论文的关键实验：

- 模型：LLaMA 65B
- 硬件：单张A100 80G
- 可训练参数：约0.1%
- 效果：在多个基准测试上达到接近全参数微调的水平

---

### 常见误区

**误区1：LoRA效果远不如全参数微调**

**事实**：在大多数SFT场景下，LoRA效果接近全参数微调（差距在1-3%以内）。只有在大幅改变模型行为的场景下（如新语言适配），全参数微调才有明显优势。

**误区2：r越大越好**

**事实**：r增大到一定程度后，效果提升非常有限，但参数量和训练成本线性增加。r=8-32是大多数场景的最佳选择。

**误区3：LoRA应该加在所有线性层上**

**事实**：实验证明只加在Q和V上效果就很好。加在更多层（K、O、FFN）效果提升有限，但参数量大幅增加。

---

### 与其他知识点的关系

- 第2-3天：LoRA作用于Transformer的**线性投影层**
- 第8天：LoRA通常用于**SFT阶段**
- 第6天：QLoRA的量化与混合精度训练相关
- 第10天：LoRA也可以用于RLHF

---

### 为什么重要

LoRA/QLoRA让大模型微调从"需要百万美元GPU集群"变成"单卡GPU就能跑"，极大降低了大模型应用门槛。2023年后几乎所有大模型微调项目都使用LoRA或其变体。

---

### 小练习

**练习1**：为什么LoRA的B矩阵初始化为0？如果A也初始化为0会怎样？

**练习2**：LoRA的r=8和r=64，哪种配置更可能过拟合？为什么？

---

### 延伸阅读

- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
- [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314)

---
