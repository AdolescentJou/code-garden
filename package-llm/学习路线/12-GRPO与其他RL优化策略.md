# 12. GRPO 与其他 RL 优化策略：DeepSeek 的群体相对策略优化

### 一句话总结

GRPO 是 DeepSeek 提出的 RL 优化算法，**省掉了价值函数网络（Critic）**，用群组内相对奖励替代绝对价值估计，大幅降低计算成本，是 DeepSeek-R1 成功的基础技术之一。

### 前置知识

- **第10天 PPO**：Actor-Critic 框架，需要Actor和Critic两个网络
- **第11天 DPO**：直接偏好优化，跳过了奖励模型
- **奖励函数**：量化回答质量的方式

### 核心概念（详细解释）

#### PPO 的痛点：Critic 太贵了

PPO 需要：

- **Actor**（策略网络）：生成回答
- **Critic**（价值网络）：评估状态价值，估计优势函数
- **优势函数**：Advantage = 实际奖励 - 价值估计，表示"这个动作比平均好多少"

训练 70B 模型时，Critic 也需要 70B 参数，显存翻倍！而且 Critic 训练不稳定——价值估计经常低估或高估，导致策略更新方向错误。

类比：PPO 就像考试时需要一个助教来帮你评估每道题得分。助教和考生一样聪明（70B参数），但助教经常误判。你既要听助教的，又不能全信。

#### GRPO 的核心洞察：不需要绝对分数，只需要相对排名

GRPO（Group Relative Policy Optimization，DeepSeek 2024）的核心洞察：

**不需要知道每个回答的"绝对分数"，只需要知道它在"同一组"里排第几。**

1. 给同一 prompt x，模型生成 **G 个回答**（如 G=8）
2. 每个回答通过奖励函数打分
3. 计算组内平均分 mu 和标准差 sigma
4. 相对优势：A_i = (r_i - mu) / sigma
5. 用相对优势更新策略

类比：考试时不需要知道绝对分数，只需要知道你在班级里排第几。排名第一的加大学习权重，倒数第一的大幅降低权重。

**为什么能省掉 Critic？** 因为 Critic 做的事是"估计平均价值"（基线），GRPO 用组内平均分替代了这个基线。

#### GRPO 工作流程

```
// 代码块
1. 采样：prompt x -> 生成 G=8 个回答 y1..y8
2. 奖励评分：r1..r8
3. 相对优势：A_i = (r_i - mu) / sigma
   示例：r=[0.9,0.6,0.95,0.3,0.8,0.7,0.5,0.85]
   mu=0.7, sigma=0.21
   A=[0.95,-0.48,1.19,-1.90,0.48,0.0,-0.95,0.71]
4. GRPO损失：loss = -min(ratio*A, clip(ratio)*A) - beta*KL
```

#### Reject Sampling（拒绝采样）

最简单的方法：生成N个回答，选最好的，用SFT方式微调。

```Python
// 代码块
def reject_sampling(model, prompt, reward_fn, N=5):
    candidates = []
    for _ in range(N):
        output = model.generate(prompt, max_new_tokens=512)
        score = reward_fn(prompt, output)
        candidates.append((output, score))
    best = max(candidates, key=lambda x: x[1])
    return best[0]
```

优点：不需要RL，实现简单。缺点：数据利用率低（只用了最好的，其他N-1个丢弃）。

#### Online DPO

传统DPO用固定数据，Online DPO从当前策略实时采样生成偏好对，"边学边练"。

优点：模型学得越好数据质量越高。缺点：训练更不稳定。

### 技术细节

#### GRPO 损失函数

    L_GRPO = -(1/G) * sum_i min(ratio(theta)*A_i, clip(ratio(theta),1-eps,1+eps)*A_i) - beta*KL

关键区别：

- 优势函数：PPO用Critic估计，GRPO用群组内相对排名
- 价值网络：PPO需要70B参数，GRPO不需要
- 基线：PPO用Critic输出，GRPO用群组平均奖励
- KL散度：GRPO直接集成到损失中（不像PPO放进奖励信号），更稳定

#### 代码示例

```Python
// 代码块
import torch
import torch.nn.functional as F

def grpo_loss(policy_logps, old_logps, rewards, beta=0.1, epsilon=0.2):
    # GRPO loss.
    # policy_logps: [G] policy model seq log-prob
    # old_logps: [G] old policy seq log-prob (frozen)
    # rewards: [G] reward scores
    G = len(rewards)
    
    # 1. 计算ratio（新策略/旧策略的概率比）
    ratio = torch.exp(policy_logps - old_logps)  # [G]
    
    # 2. 组内相对优势（替代Critic的价值估计）
    mean_r = rewards.mean()
    std_r = rewards.std(unbiased=False)
    advantages = (rewards - mean_r) / (std_r + 1e-8)  # [G]
    
    # 3. PPO损失项（限制策略更新幅度）
    surr1 = ratio * advantages
    surr2 = torch.clamp(ratio, 1-epsilon, 1+epsilon) * advantages
    ppo_loss = -torch.min(surr1, surr2)
    
    # 4. KL惩罚（直接集成到损失中）
    kl = (policy_logps - old_logps).mean().abs()
    
    loss = (ppo_loss + beta * kl).mean()
    return loss, advantages

# 模拟数据
rewards = torch.tensor([0.9, 0.6, 0.95, 0.3, 0.8, 0.7, 0.5, 0.85])
policy_logps = torch.tensor([-2.1, -2.5, -2.0, -3.0, -2.2, -2.3, -2.8, -2.1])
old_logps = torch.tensor([-2.0, -2.4, -1.9, -2.9, -2.1, -2.2, -2.7, -2.0])

loss, adv = grpo_loss(policy_logps, old_logps, rewards)
print(f"Loss: {loss.item():.4f}")
print(f"Advantages: {adv.tolist()}")
# Advantages: [0.95, -0.48, 1.19, -1.90, 0.48, 0.0, -0.95, 0.71]
```

#### RL 策略对比总表

| 策略 | 价值网络 | 奖励模型 | 参考模型 | 规则奖励 | 训练复杂度 |
| --- | --- | --- | --- | --- | --- |
| PPO | 需要 | 需要 | 需要 | 可选 | 高 |
| DPO | 不需要 | 不需要 | 需要 | 不需要 | 低 |
| GRPO | 不需要 | 不需要 | 不需要 | 需要 | 中 |
| Reject Sampling | 不需要 | 不需要 | 可选 | 需要 | 低 |
| Online DPO | 不需要 | 不需要 | 需要 | 可选 | 中 |

### 实际案例

#### DeepSeek-R1：GRPO 的代表作

- SFT：1500万条数据微调DeepSeek-V3（671B MoE，激活37B）
- GRPO + **规则奖励**：
  - 数学题：检查最终答案是否正确（精确匹配）
  - 代码题：运行代码看测试通过率
  - 格式奖励：检查回答是否包含 <thinking> 标签
- 效果：达到GPT-4水平，训练成本只有1/10

#### Qwen-Math

通义千问也用GRPO+规则奖励，数学基准超过GPT-4。

### 常见误区

- **GRPO不需要任何奖励**：仍需要奖励函数，只是不需要训练奖励模型。DeepSeek用规则奖励
- **GRPO省掉了所有额外模型**：仍有"旧策略模型"（pi_old）用于计算ratio
- **Reject Sampling不如GRPO**：奖励可靠时（数学/代码），Reject Sampling+SFT足够强大
- **Online DPO一定比离线DPO好**：模型可能陷入局部最优（用自己生成的数据训练自己）

### 与其他知识点的关系

- 前驱：PPO（第10天）、DPO（第11天）
- 后继：推理优化（第13-17天）
- DeepSeek-R1的成功：规则奖励+GRPO成为新范式

### 为什么重要

1. 算力革命：省掉70B价值网络，成本大幅降低
2. 规则驱动对齐：不需要复杂奖励模型
3. 开源里程碑：DeepSeek-R1证明有限资源下可实现高质量对齐

### 小练习

1. G=4，奖励[0.9,0.6,0.8,0.3]，计算相对优势。

   （答案：mu=0.65, sigma=0.25, A=[1.0,-0.2,0.6,-1.4]）

1. GRPO省掉Critic后，从显存和计算两个角度说明成本降低。

   （答案：省一半显存+50%计算量+通信开销降低）

### 延伸阅读

1. [DeepSeekMath论文](https://arxiv.org/abs/2402.03300)
2. [DeepSeek-R1论文](https://arxiv.org/abs/2501.12948)

---
