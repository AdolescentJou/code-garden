# 第10天：RLHF 基本原理—— Reward Model训练 → PPO优化、人类偏好数据、KL惩罚

**一句话总结**：RLHF用人类对模型回答的偏好排序来训练一个奖励模型，再用强化学习让模型学会生成人类更喜欢的回答，是大模型"对齐人类意图"的核心方法。

**前置知识**：第1天（什么是大模型）、第4天（预训练）、第8天（SFT）、基础强化学习概念。

---

### 核心概念

#### 1.1 为什么需要RLHF？

SFT只能教模型"模仿好的回答"，但它无法处理以下问题：

1. **"如何解决中东冲突"** → 人类自己也写不出完美答案，SFT数据从哪来？
2. **模型倾向于说"两头不得罪的话"** → 安全但不有用
3. **模型可能产生有害、错误或误导性内容**

**核心洞见**：用人类对多个回答的**偏好排序**替代固定答案，让模型在试错中学会"人类的品味、情商和三观"。

**InstructGPT论文的关键结论**：**1.3B参数的模型，在人类偏好评估中优于175B参数的GPT-3**。对齐方法比模型规模更重要！

#### 1.2 RLHF三阶段流程

```
// 代码块
阶段1: SFT（监督微调）
  预训练模型 → SFT → SFT模型（学会基本指令遵循）
                              │
                              ▼
阶段2: 训练奖励模型（Reward Model）
  SFT模型生成多个回答 → 人类排序 → 训练RM
  RM输入：(问题, 回答) → 输出：标量分数
                              │
                              ▼
阶段3: PPO强化学习优化
  SFT模型生成回答 → RM打分 → 用PPO更新模型
  + KL惩罚（防止偏离SFT模型太远）
                              │
                              ▼
  最终对齐模型（ChatGPT等）
```

#### 1.3 阶段一：SFT

这是第8天讲过的监督微调。SFT模型作为后续PPO的**起点（初始策略）**。

#### 1.4 阶段二：训练奖励模型（Reward Model）

**核心思路**：训练一个独立的模型，输入"问题+回答"，输出一个分数，模拟人类偏好判断。

**数据收集方式**：

- 让SFT模型对同一个提示生成**多个回答**（如A、B、C、D）
- 人类标注员对这些回答进行**排序**（如 A > B > C > D）
- 排序数据比打分数据更好收集——人更容易判断"哪个更好"而非"好多少"

**为什么用排序而不是打分？**

因为不同标注员对"好"的标准不同——有人打5分有人打3分。但"A比B好"的判断在不同标注员之间是一致的。

**奖励模型训练**：

使用**Pairwise Ranking Loss（成对排序损失）**：

$$\mathcal{L}_{RM} = -\mathbb{E}_{(x,y_w,y_l)} \left[ \log \sigma(r_\theta(x, y_w) - r_\theta(x, y_l)) \right]$$

其中：

- $(x, y_w, y_l)$ 是一个三元组：提示x，人类偏好的回答 $y_w$（winner），被拒绝的回答 $y_l$（loser）
- $r_\theta$ 是奖励模型，输出一个标量分数
- $\sigma$ 是sigmoid函数

**逐步理解这个损失函数**：

1. 好回答的得分 $r_\theta(x, y_w)$ 应该高于差回答的得分 $r_\theta(x, y_l)$
2. 两者之差 $r_\theta(x, y_w) - r_\theta(x, y_l)$ 越大越好
3. 通过sigmoid把差值映射到(0,1)区间
4. 取负对数得到损失——模型要让"好回答得分高于差回答"的概率最大化

**类比**：RM就像一个"美食评委"——尝两道菜，判断哪道更好。训练目标是让评委的判断和人类一致。

#### 1.5 阶段三：PPO强化学习优化

将SFT模型作为**策略模型（Actor）**，奖励模型作为**评分器**，用PPO算法优化。

**PPO（Proximal Policy Optimization）核心思想**：

1. Actor（SFT模型）生成回答
2. RM给回答打分
3. 计算优势（Advantage）= 分数 - 基线
4. 用梯度上升更新Actor，让它生成更高分的回答
5. **但**不能更新太多——用clip限制更新幅度

**PPO的Clip损失**：

$$L^{CLIP}(\theta) = \mathbb{E}_t \left[ \min(r_t(\theta) \hat{A}_t, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon) \hat{A}_t) \right]$$

其中 $r_t(\theta) = \frac{\pi_\theta(a|s)}{\pi_{\theta_{old}}(a|s)}$ 是新旧策略的概率比。

**通俗理解PPO Clip**：

- 如果新策略比旧策略好太多（$r_t > 1+\epsilon$），就不再继续往那个方向更新——防止"矫枉过正"
- 如果新策略比旧策略差太多（$r_t < 1-\epsilon$），也不继续惩罚——给模型"改正"的机会
- 类比：开车时不能猛打方向盘——即使方向对了，也要限制每次的转动幅度

#### 1.6 KL惩罚（KL Divergence Penalty）

**问题**：如果只追求RM高分，模型可能找到"作弊"方式——比如堆砌华丽辞藻骗取高分，但实际内容空洞。

**解决方案**：加一个KL散度惩罚，限制策略模型不能偏离SFT模型太远：

$$L^{total} = L^{CLIP} - \beta \cdot \mathbb{E}[\text{KL}(\pi_\theta || \pi_{ref})]$$

其中 $\pi_{ref}$ 是参考模型（冻结的SFT模型），$\beta$ 是惩罚系数。

**类比**：KL惩罚就像给模型一个"缰绳"——你可以探索新的回答方式，但不能跑太远。跑太远了就拉回来。

**"奖励黑客"（Reward Hacking）的例子**：

- 模型发现RM喜欢长回答 → 所有回答都变得很长
- 模型发现RM喜欢格式化的回答 → 所有回答都变成列表格式
- KL惩罚通过限制偏离程度来防止这些行为

---

### 技术细节

#### 2.1 RLHF代码实现（简化版）

```Python
// 代码块
import torch
import torch.nn as nn
import torch.nn.functional as F

def reward_model_loss(rewards_chosen, rewards_rejected):
    """奖励模型训练损失（成对排序）
    
    参数:
        rewards_chosen: 人类偏好的回答的RM分数
        rewards_rejected: 人类拒绝的回答的RM分数
    """
    # -log(sigmoid(r_win - r_lose))
    return -F.logsigmoid(rewards_chosen - rewards_rejected).mean()


def ppo_loss(logprobs, old_logprobs, advantages, clip_range=0.2):
    """PPO Clip损失
    
    参数:
        logprobs: 当前策略的log概率
        old_logprobs: 旧策略的log概率
        advantages: 优势函数
        clip_range: clip范围
    """
    # 概率比 = exp(new_logprob - old_logprob)
    ratio = torch.exp(logprobs - old_logprobs)
    
    # Clip：限制概率比在[1-ε, 1+ε]范围内
    clipped_ratio = torch.clamp(ratio, 1 - clip_range, 1 + clip_range)
    
    # 取min（悲观更新）
    surrogate = torch.min(ratio * advantages, clipped_ratio * advantages)
    
    return -surrogate.mean()  # 取负因为要最大化


def kl_penalty(logprobs, ref_logprobs):
    """KL散度惩罚"""
    # KL(π_θ || π_ref) ≈ E[log(π_θ) - log(π_ref)]
    return (logprobs - ref_logprobs).mean()


def rlhf_step(actor_model, ref_model, rm_model, optimizer, batch, 
              clip_range=0.2, kl_coeff=0.1):
    """RLHF训练步骤（简化版）"""
    prompts = batch['prompts']
    
    # 1. Actor生成回答
    responses = actor_model.generate(prompts)
    
    # 2. 奖励模型打分
    with torch.no_grad():
        rewards = rm_model(prompts, responses)
    
    # 3. 计算优势（这里简化为 rewards - mean(rewards)）
    advantages = rewards - rewards.mean()
    
    # 4. 计算当前策略的对数概率
    logprobs = actor_model.compute_logprobs(prompts, responses)
    
    # 5. 计算参考策略的对数概率（用于KL惩罚）
    with torch.no_grad():
        ref_logprobs = ref_model.compute_logprobs(prompts, responses)
    
    # 6. 计算总损失
    ppo_loss_val = ppo_loss(logprobs, logprobs.detach(), advantages, clip_range)
    kl_val = kl_penalty(logprobs, ref_logprobs)
    total_loss = ppo_loss_val + kl_coeff * kl_val  # 注意是加号，因为KL是惩罚
    
    # 7. 反向传播和更新
    optimizer.zero_grad()
    total_loss.backward()
    torch.nn.utils.clip_grad_norm_(actor_model.parameters(), max_norm=1.0)
    optimizer.step()
    
    return {
        'loss': total_loss.item(),
        'reward': rewards.mean().item(),
        'kl': kl_val.item()
    }
```

#### 2.2 RLHF实践要点

| 参数 | 典型值 | 说明 |
| --- | --- | --- |
| RM大小 | 6B（监督175B LM） | RM通常比LM小很多 |
| PPO clip range | 0.1-0.2 | 控制策略更新幅度 |
| KL penalty系数 | 0.01-0.1 | 控制偏离参考模型的幅度 |
| 人类偏好数据量 | 数千到数万条 | 质量 >> 数量 |

#### 2.3 对齐的三个目标（InstructGPT/ChatGPT）

1. **Helpful（有帮助）**：能解决用户问题
2. **Honest（诚实）**：不故意误导或编造
3. **Harmless（无害）**：尽量避免造成现实风险

这三个目标有时冲突——比如"如何制作炸弹"的诚实回答不是无害的。RLHF通过人类偏好数据来平衡这些目标。

---

### 实际案例

#### ChatGPT的RLHF

ChatGPT的RLHF流程（来自InstructGPT论文）：

| 阶段 | 数据量 | 说明 |
| --- | --- | --- |
| SFT | ~13K条 | 人类标注员撰写的prompt-completion对 |
| RM | ~33K条 | 人类对模型回答的偏好排序 |
| PPO | ~31K条 | 不需要人类标注，RM自动打分 |

**关键发现**：仅1.3B参数的InstructGPT在人类评估中击败了175B的GPT-3——对齐比规模更重要！

#### DPO：RLHF的替代方案

DPO（Direct Preference Optimization）是2023年提出的一种新方法，**不需要训练RM和PPO**，直接用偏好数据优化模型：

$$L_{DPO} = -\log \sigma\left(\beta \log \frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)}\right)$$

**DPO的优势**：

- 不需要训练单独的RM
- 不需要PPO（更简单、更稳定）
- 效果接近RLHF

**DPO的劣势**：

- 理论上不如RLHF灵活
- 在复杂对齐场景下可能不如PPO

---

### 常见误区

**误区1：RLHF让模型变得更"聪明"**

**事实**：RLHF不增加模型的知识或推理能力，只是让模型更"对齐"人类偏好——更礼貌、更有用、更安全。

**误区2：RLHF完美解决了对齐问题**

**事实**：RLHF有很多问题——奖励黑客、偏见放大、过度安全（拒绝无害请求）。对齐仍是一个开放问题。

**误区3：PPO是唯一的选择**

**事实**：DPO、KTO、ORPO等新方法不需要PPO，更简单更稳定。

---

### 与其他知识点的关系

- 第8天：SFT是RLHF的**前置步骤**，提供初始策略模型
- 第4天：预训练模型是RLHF的**起点**
- 第9天：LoRA可以用于RLHF的训练过程
- 第5天：RLHF使用AdamW等优化器

---

### 为什么重要

RLHF是ChatGPT从"能续写文本"变成"有用助手"的关键。它解决了大模型"知识多但不会用"的问题，让模型真正对齐人类意图。

**核心洞察**：对齐比规模更重要。1.3B的对齐模型能击败175B的未对齐模型——这是大模型领域最重要的发现之一。

---

### 小练习

**练习1**：为什么用排序数据而不是打分数据训练奖励模型？

**练习2**：如果没有KL惩罚，PPO优化会出现什么问题？举一个"奖励黑客"的例子。

---

### 延伸阅读

- [Training language models to follow instructions with human feedback (InstructGPT)](https://arxiv.org/abs/2203.02155)
- [Constitutional AI](https://arxiv.org/abs/2212.08073)
- [Direct Preference Optimization (DPO)](https://arxiv.org/abs/2305.18290)

---
