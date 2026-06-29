# 13. KV Cache 与推理优化：大模型推理的显存管理术

### 一句话总结

KV Cache 是 Transformer 推理中的**显存黑洞**——每生成一个 token 都要缓存之前所有 token 的 Key-Value 对，PagedAttention 借鉴操作系统虚拟内存分页思想管理 KV Cache，大幅提升显存利用率。

### 前置知识

- **第2天 Transformer 自注意力**：Q/K/V 投影、缩放点积注意力
- **自回归生成**：逐个 token 生成，每步依赖之前所有 token
- **Prefill / Decode 两阶段**：推理分为预填充和生成

### 核心概念（详细解释）

#### 为什么需要 KV Cache？从暴力计算到缓存优化

自回归生成中，第 t 步注意力需要：

    Attention(Q_t, K_{1:t}, V_{1:t})

**暴力方案**：每步重新计算所有 K/V，总计算量 O(t^2)
**KV Cache 方案**：缓存已计算的 K/V，只算新增的，总计算量 O(t)

```
// 代码块
暴力方案（无缓存）：
Step1: 计算K1V1 -> Attention -> token1    (1次计算)
Step2: 计算K1V1K2V2 -> Attention -> token2  (2次计算)
Step3: 计算K1V1K2V2K3V3 -> Attention -> token3 (3次计算)
总计：1+2+3 = O(t^2)次

KV Cache（有缓存）：
Step1: 计算K1V1->缓存->Attention->token1    (1次)
Step2: 计算K2V2->追加缓存->Attention->token2  (1次)
Step3: 计算K3V3->追加缓存->Attention->token3  (1次)
总计：1+1+1 = O(t)次

从 O(t^2) 降到 O(t)！
```

#### KV Cache 显存占用有多大？

每个 token 的 KV Cache = 2 x H x d x 2字节（FP16）

| 模型 | H | d | 每token KV | 2048 tokens | 8192 tokens |
| --- | --- | --- | --- | --- | --- |
| Llama-2 7B | 32 | 128 | 16KB | 32MB | 128MB |
| Llama-3 70B | 64 | 128 | 32KB | 64MB | 256MB |
| Llama-3 405B | 128 | 128 | 64KB | 128MB | 512MB |

看似不大，但：

1. **并发请求**：生产环境几十到几百个请求
2. **最大长度预留**：每个请求预留最大可能长度
3. **KV Cache 占推理显存 60-80%**

70B模型在H100(80GB)：权重70GB + KV Cache(4并发x2048)8GB + 其他2GB = 80GB。并发从4涨到8就OOM。

#### KV Cache 三大问题

1. **内存碎片**：不同请求序列长度不同，显存分配不连续
2. **利用率低**：预留最大长度，但平均只用一小部分
3. **并发困难**：多请求显存管理复杂

#### PagedAttention（vLLM）：分页管理

灵感来自操作系统虚拟内存分页：

```
// 代码块
传统方案（连续分配）：
请求A(1024t): [AAAAAA..............]  -> 预留2048，浪费一半
请求B(2048t): [BBBBBBBBBBBBBBBBBBBB]  -> 刚好
请求C(512t):  [CC..]                  -> 剩余空间不够！
-> 大量碎片，利用率低

PagedAttention（分页管理）：
物理页池（所有请求共享）：
[A1][A2][B1][B2][C1][A3][B3][B4][A4][B5]...
按需分配，利用率接近100%！
每页16 tokens，请求A=64页，请求B=128页，请求C=32页
```

#### 核心数据结构

```Python
// 代码块
import torch
from typing import List

class Block:
    # physical page, stores K/V vectors
    def __init__(self, num_tokens, num_kv_heads, head_dim, dtype=torch.float16):
        self.k_cache = torch.zeros(num_tokens, num_kv_heads, head_dim, dtype=dtype)
        self.v_cache = torch.zeros(num_tokens, num_kv_heads, head_dim, dtype=dtype)
        self.ref_count = 0

class LogicalBlockTable:
    # logical to physical page mapping, like OS page table
    def __init__(self):
        self.physical_blocks: List[Block] = []
    
    def append(self, block: Block):
        self.physical_blocks.append(block)
        block.ref_count += 1

class BlockAllocator:
    # physical page allocator
    def __init__(self, total_blocks, block_size, num_kv_heads, head_dim):
        self.free_blocks = list(range(total_blocks))
        self.blocks = [Block(block_size, num_kv_heads, head_dim) 
                       for _ in range(total_blocks)]
    
    def allocate(self, num_blocks):
        if len(self.free_blocks) < num_blocks:
            raise MemoryError(f"Need {num_blocks}, only {len(self.free_blocks)} free")
        allocated = self.free_blocks[:num_blocks]
        self.free_blocks = self.free_blocks[num_blocks:]
        return [self.blocks[b] for b in allocated]
    
    def free(self, blocks):
        for b in blocks:
            if hasattr(b, 'block_id'):
                self.free_blocks.append(b.block_id)

# 使用示例
allocator = BlockAllocator(2048, 16, 32, 128)
req_a = allocator.allocate(64)   # 1024 tokens = 64页
req_b = allocator.allocate(128)  # 2048 tokens = 128页
req_c = allocator.allocate(32)   # 512 tokens = 32页
print(f"Allocated: {64+128+32}/2048 blocks, {len(allocator.free_blocks)} free")
```

#### Prefix Caching（前缀缓存）

系统提示词可以完全复用：

```
// 代码块
用户1: "你是AI助手。用中文回答。问题: 天气怎么样？"
用户2: "你是AI助手。用中文回答。问题: 推荐一部电影？"
前缀"你是AI助手。用中文回答。"完全相同 -> 缓存前缀KV Cache，复用！
```

### 实际案例

#### vLLM 性能数据（H100 上 70B）

- 吞吐量：比传统方案提升 2.5-5x
- 并发：支持 1000+ 请求（传统100左右）
- 显存利用率：从 20-40% 提升到 80-95%

#### 推理框架对比

| 框架 | KV Cache管理 | 灵活性 | 性能 |
| --- | --- | --- | --- |
| vLLM | PagedAttention | 高 | 高 |
| TensorRT-LLM | 自定义CUDA | 低 | 最高 |
| TGI | 自定义CUDA | 中 | 高 |

### 常见误区

- **KV Cache占显存不多**：实际占推理显存60-80%，管理不好直接OOM
- **PagedAttention增加延迟**：页表查表是O(1)，延迟可忽略。主要优化吞吐量
- **KV Cache在训练时也用到**：只在推理时用，训练时所有token同时计算
- **KV Cache大小只和模型有关**：还和并发数和序列长度有关

### 与其他知识点的关系

- 前驱：Transformer注意力（第2天）
- 平行：FlashAttention（第14天）优化计算效率
- 后继：量化（第16天）压缩KV Cache精度

### 为什么重要

1. 推理成本决定因素：KV Cache占60-80%推理显存
2. 并发服务基石：PagedAttention让多请求并发成为可能
3. 所有推理框架的核心优化点

### 小练习

1. Llama-3 8B（32 KV head, d=128, FP16），计算每token KV大小和1024 tokens的KV大小。

   （答案：16KB/token, 16MB/1024tokens）

1. 每页16 tokens，50 tokens需要几页？100 tokens呢？

   （答案：4页, 7页）

### 延伸阅读

1. [vLLM PagedAttention论文](https://arxiv.org/abs/2309.06180)
2. [vLLM文档](https://vllm.readthedocs.io/)

---
