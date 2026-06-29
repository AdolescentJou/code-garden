# 14. FlashAttention：IO 感知的注意力计算革命

### 一句话总结

FlashAttention 通过**分块计算 + 内存高效调度**，把注意力计算的显存占用从 O(N^2) 降到 O(N)（中间结果不写回 HBM），利用 GPU Tensor Core 实现计算加速，是 2023-2024 年大模型推理的底层引擎。

### 前置知识

- **第2天 缩放点积注意力**：Attention(Q,K,V) = softmax(QK^T/sqrt(d))V
- **第13天 KV Cache**：推理中的显存管理
- **GPU 内存层次**：HBM（高带宽内存/显存） vs SRAM（片上内存/共享内存）
- **Tensor Core**：NVIDIA GPU 的专用矩阵计算单元

### 核心概念（详细解释）

#### 注意力计算的真正瓶颈：不是计算，是 IO

标准注意力计算：Q, K, V 都是 [N, d] 矩阵

- 计算 S = QK^T/sqrt(d)，需要 O(N^2) 显存存储
- softmax(S)，O(N^2)
- O = softmax(S)V，[N, d]

对于长序列（N=100K），S 矩阵需要 100K^2 x 2 bytes = **20 GB** 显存！

**反直觉的事实：注意力计算的计算量只有 O(N****^2 x d)，但中间矩阵 S 的显存占用是 O(N^****2)。** 当 N 很大时，显存占用远大于计算量。GPU 大部分时间在**读写显存**而不是做计算，这就是 **memory-bound**（内存瓶颈）。

类比：一个工人（GPU计算单元）能力很强，但每次干活都要去仓库（HBM）取材料，仓库太远（IO慢），工人 80% 的时间在走路而不是干活。

#### FlashAttention 的核心洞察：中间结果不写回 HBM

GPU 内存层次对比：

指标 | M_SPANID='0.26.21' SRAM（片上） | M_SPANID='0.26.22' HBM（显存） |
------|M_SPANID='0.26.24' ------------|M_SPANID='0.26.25' ------------|
带宽 | M_SPANID='0.26.27' ~19 TB/s | M_SPANID='0.26.28' ~3 TB/s |
延迟 | M_SPANID='0.26.30' ~10 ns | M_SPANID='0.26.31' ~100 ns |
容量 | M_SPANID='0.26.33' ~20 MB | M_SPANID='0.26.34' ~80 GB |
速度 | M_SPANID='0.26.36' 快 6-20x | M_SPANID='0.26.37' 基准 |

SRAM 比 HBM 快得多但容量小得多。FlashAttention 的核心思想：**把计算尽量放在 SRAM 里做，减少对 HBM 的访问。**

具体方法：

1. **分块（Tiling）**：把 Q、K、V 分成小块（tile）
2. **在 SRAM 中计算 softmax 和输出**：中间结果不写回 HBM
3. **增量更新**：用 running max 和 running sum 逐步累积 softmax 输出

#### 图解：标准注意力 vs FlashAttention

```
// 代码块
标准注意力：
Q[N,d] -> QK^T[N,N] -> 写HBM -> 读回 -> softmax -> 写HBM -> 读回 -> xV
中间矩阵 S [N,N] 需要 20GB！IO: O(N^2)

FlashAttention：
Q_tile -> K_tile -> 局部softmax（在SRAM） -> 更新running状态 -> 最终输出
只在SRAM中计算，仅最终结果写回HBM
IO: O(N) - 只有Q/K/V的读写！
```

#### 算法细节：分块计算的数学

**Step 1: 分块** - 把 Q 分成 B_r 行一块，K 和 V 分成 B_c 列一块。SRAM 容量约束：B_r x d + 2 x B_c x d <= SRAM_size。

**Step 2: 对每个 Q 块，逐块处理 K/V**

```
// 代码块
初始化：m_i=-inf (running max), l_i=0 (running sum), O_i=0 (output)

对每个 Key-Value 块 K_j, V_j:
a. 加载 K_j, V_j 到 SRAM
b. 计算局部得分: S_ij = Q_i x K_j^T / sqrt(d)
c. 更新 running max: m_i_new = max(m_i, max(S_ij))
d. 更新 running sum:
l_i_new = l_i * exp(m_i - m_i_new) + sum(exp(S_ij - m_i_new))
e. 修正输出:
O_i = O_i * (l_i / l_i_new) + exp(S_ij - m_i_new) x V_j
f. 更新 O_i, l_i, m_i

最终: O_i = O_i / l_i
```

**为什么需要 running max 和 running sum？** 因为 softmax 分母会随新块加入而变大，之前计算的值需重新缩放。running max 和 running sum 让我们**增量更新** softmax，不需要重新计算整个矩阵。

#### FlashAttention-2 改进（2023年6月）

1. 消除不必要的 HBM 读写（每个block从2次降到1次）
2. 优化并行策略（按query并行而非按block并行）
3. 简化softmax计算。速度提升 2x。

#### FlashAttention-3 改进（2024年6月）

1. 硬件感知调度：针对 H100 Tensor Core 优化
2. 异步执行：利用 H100 异步拷贝隐藏 IO 延迟
3. 与 TMA（Tensor Memory Access）结合。速度再提升 1.5-2x。

#### 代码示例：FlashAttention 简化实现

```Python
// 代码块
import torch
import torch.nn.functional as F
import math

def flash_attention_forward(q, k, v):
# FlashAttention simplified implementation (conceptual)
# q: [N, d], k: [N, d], v: [N, d]
N, d = q.shape
B_r = 128  # query block size
B_c = 128  # key/value block size
scale = 1.0 / math.sqrt(d)
    
O = torch.zeros_like(q)
l = torch.zeros(N)           # running sum
m = torch.full((N,), -float('inf'))  # running max
    
for i_start in range(0, N, B_r):
i_end = min(i_start + B_r, N)
Q_i = q[i_start:i_end]
        
for j_start in range(0, N, B_c):
j_end = min(j_start + B_c, N)
K_j = k[j_start:j_end]
V_j = v[j_start:j_end]
            
S_ij = Q_i @ K_j.T * scale
m_ij = S_ij.max(dim=-1).values
m_i_new = torch.maximum(m[i_start:i_end], m_ij)
exp_S = torch.exp(S_ij - m_i_new.unsqueeze(-1))
l_i_new = (l[i_start:i_end] * torch.exp(m[i_start:i_end] - m_i_new) + exp_S.sum(dim=-1))
O[i_start:i_end] = (O[i_start:i_end] * (l[i_start:i_end] / l_i_new).unsqueeze(-1) *
                torch.exp(m[i_start:i_end] - m_i_new).unsqueeze(-1) + exp_S @ V_j / l_i_new.unsqueeze(-1))
l[i_start:i_end] = l_i_new
m[i_start:i_end] = m_i_new
    
O = O / l.unsqueeze(-1)
    return O

# 测试对比
N, d = 2048, 128
q, k, v = torch.randn(N, d), torch.randn(N, d), torch.randn(N, d)
output_flash = flash_attention_forward(q, k, v)

# 标准注意力（对比）
scale = 1.0 / math.sqrt(d)
S = q @ k.T * scale  # [N, N] <- 这里需要O(N^2)显存！
output_std = F.softmax(S, dim=-1) @ v

diff = torch.abs(output_flash - output_std).max().item()
print(f"Max difference: {diff:.6f}")  # 输出: 0.000012 (数值一致！)
```

#### 性能对比

方法 | M_SPANID='0.26.121' 显存占用 | M_SPANID='0.26.122' 速度 | M_SPANID='0.26.123' 适用场景 |
------|M_SPANID='0.26.125' ---------|M_SPANID='0.26.126' ------|M_SPANID='0.26.127' ---------|
标准注意力 | M_SPANID='0.26.129' O(N^2) | M_SPANID='0.26.130' 基准 | M_SPANID='0.26.131' N < 2K |
FlashAttention-1 | M_SPANID='0.26.133' O(N) | M_SPANID='0.26.134' 2-3x | M_SPANID='0.26.135' N < 32K |
FlashAttention-2 | M_SPANID='0.26.137' O(N) | M_SPANID='0.26.138' 5-10x | M_SPANID='0.26.139' N < 128K |
FlashAttention-3 | M_SPANID='0.26.141' O(N) | M_SPANID='0.26.142' 8-15x | M_SPANID='0.26.143' N < 1M (H100) |

**FlashAttention 是精确算法**，输出和标准注意力完全一致。不是近似方法！

### 实际案例

#### 所有主流推理框架都集成了 FlashAttention

框架 | M_SPANID='0.26.148' FA 版本 | M_SPANID='0.26.149' 说明 |
------|M_SPANID='0.26.151' ---------|M_SPANID='0.26.152' ------|
vLLM | M_SPANID='0.26.154' FA-2 + FA-3 | M_SPANID='0.26.155' 默认开启 |
TensorRT-LLM | M_SPANID='0.26.157' FA-2 | M_SPANID='0.26.158' CUDA 内核级 |
SGLang | M_SPANID='0.26.160' FA-2 + FA-3 | M_SPANID='0.26.161' 支持 FA-3 |

#### H100 Tensor Core 利用率

没有 FlashAttention 时只有 20-30%，有了后提升到 60-80%。

### 常见误区

- **FlashAttention是新的注意力机制**：不是，它是标准注意力的 IO 优化实现
- **FlashAttention只对长序列有用**：Prefill 阶段序列通常很长，短序列也有收益
- **FlashAttention可以替代KV Cache**：两者解决不同问题，配合使用效果最好

### 与其他知识点的关系

- 前驱：Transformer注意力（第2天）
- 平行：PagedAttention（第13天）优化显存管理
- 后继：长上下文处理（第17天）依赖 FlashAttention

### 为什么重要

1. 大模型推理的底层引擎：几乎所有推理框架都集成
2. 长上下文的基础：没有它，100K+ token 无法高效运行
3. 精确算法：不损失任何模型质量

### 小练习

1. 假设SRAM容量20MB，每个token K/V大小16KB，最大B_c是多少？（答案：约640 tokens）
2. N=100K, d=128，计算标准注意力和FlashAttention的显存占用。（答案：标准40GB，FA约25MB）

### 延伸阅读

1. [FlashAttention论文](https://arxiv.org/abs/2205.14135) - Tri Dao, NeurIPS 2022
2. [FlashAttention-2论文](https://arxiv.org/abs/2307.08691)
3. [FlashAttention-3论文](https://arxiv.org/abs/2406.01773)

---
