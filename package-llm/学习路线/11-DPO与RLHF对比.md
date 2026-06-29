# 11. DPO 与 RLHF 对比：从三阶段流水线到一步到位

### 一句话总结

DPO 把 RLHF 的"训练奖励模型 + 强化学习优化"两阶段合并成一个分类损失，**跳过了奖励模型和 PPO**，用数学推导证明语言模型本身就是一个隐含的奖励模型。

### 前置知识

- **第9天 SFT**：监督微调，用标注数据让模型学会"好好回答"
- **第10天 RLHF**：三阶段训练流程（SFT - 奖励模型 - PPO），传统对齐方式
- **KL 散度**：衡量两个概率分布之间的差异，越小越相似
- **Bradley-Terry 模型**：成对比较的概率模型，用于建模"A 比 B 好"的概率

### 核心概念（详细解释）

#### 为什么需要 DPO？回顾 RLHF 的痛苦

RLHF 是 ChatGPT 走向成功的关键技术。流程：

1. **SFT 微调**：用高质量问答数据微调模型，得到"基础好学生"
2. **训练奖励模型（RM）**：给同一问题让模型生成两个回答，人工标注"哪个更好"，训练奖励模型
3. **PPO 优化**：用 PPO 算法根据奖励模型分数优化语言模型

实践中问题一大堆：

- **奖励模型容易过拟合**：只看到几百组数据，容易"记住"而非"理解"
- **PPO 训练极不稳定**：平衡"探索新策略"和"不偏离太多"极难调
- **三阶段是 bug 叠加**：SFT 有 bug，RM 有 bug，PPO 有 bug，串在一起
- **算力翻倍**：奖励模型参数量和语言模型一样大

类比：RLHF 就像考试前老师出模拟题（SFT），请评分员打分（奖励模型），根据分数调整学习策略（PPO）。任何一个环节出问题整个流程就崩了。

#### DPO 的核心洞察：语言模型本身就是奖励模型

DPO（斯坦福，2023年NeurIPS）的核心洞察：**不需要奖励模型，语言模型自己就能"评分"。**

给你问题 x，生成回答 y。概率 pi(y|x) 高的回答大概率是好回答，概率低的大概率是烂回答。DPO 说：**直接用这个概率做偏好优化，跳过奖励模型。**

类比：不用请评分员了，学生自己就能判断答案好不好。

#### Bradley-Terry 模型：偏好数据的数学语言

DPO 的数学基础是 Bradley-Terry 模型，最初用于体育排名：

    P(A > B) = exp(r_A) / (exp(r_A) + exp(r_B))

翻译到大模型：

    P(y_w > y_l | x) = exp(r(x, y_w)) / (exp(r(x, y_w)) + exp(r(x, y_l)))

**偏好概率取决于两个回答的奖励分数差。**

#### DPO 的关键推导：奖励函数到策略概率

从 RLHF 目标函数出发：

    max_{pi_theta} E[r(x,y)] - beta * KL(pi_theta || pi_ref)

在最优策略 pi* 下有闭式解：

    r*(x, y) = beta * log(pi*(y|x) / pi_ref(y|x))

**最优奖励函数和最优策略等价！** 代入 Bradley-Terry 模型化简得 DPO 损失：

    L_DPO = -log sigma(beta * log(pi_theta(y_w|x)/pi_ref(y_w|x)) - beta * log(pi_theta(y_l|x)/pi_ref(y_l|x)))

#### 直观理解 DPO 损失

1. 让策略模型对"偏好回答"的概率**上升**
2. 让策略模型对"不偏好回答"的概率**下降**
3. sigmoid 压缩差值：差值越大，损失越小

**让模型更愿意生成好回答、更不愿意生成坏回答。**

### 技术细节

#### 完整数学推导（一步步来）

**Step 1**: RLHF 目标：max E[r(x,y)] - beta*KL(pi_theta || pi_ref)

**Step 2**: 展开KL散度，用拉格朗日乘子法求最优解：
    pi*(y|x) = pi_ref(y|x) * exp(r(x,y)/beta) / Z(x)

**Step 3**: 取对数：
    r(x,y) = beta*log(pi*(y|x)/pi_ref(y|x)) + beta*log Z(x)

**Step 4**: 代入Bradley-Terry模型，Z(x)在分子分母都出现，约掉

**Step 5**: 最大化对数似然，得到 DPO 损失函数

关键：Z(x)（归一化因子）在 Bradley-Terry 的分子分母都出现，完美约掉！这就是DPO不需要奖励模型的数学原因。

#### 代码示例：DPO 损失函数

```Python
// 代码块
import torch
import torch.nn.functional as F

def dpo_loss(policy_logps, ref_logps, beta=0.1):
    # DPO loss function.
    # policy_logps: [B, 2] - [chosen, rejected] log-prob
    # ref_logps: [B, 2] - ref model log-prob
    # beta: KL penalty strength
    # 计算策略模型相对于参考模型的log-ratio
    chosen_ratio = policy_logps[:, 0] - ref_logps[:, 0]
    rejected_ratio = policy_logps[:, 1] - ref_logps[:, 1]
    
    # DPO损失：-log sigma(beta * (chosen_ratio - rejected_ratio))
    logits = beta * (chosen_ratio - rejected_ratio)
    loss = -F.logsigmoid(logits)
    return loss.mean()

# 模拟数据：batch_size=4
policy_logps = torch.tensor([[-2.1, -3.5], [-1.8, -2.9], [-4.2, -3.1], [-1.5, -5.0]])
ref_logps = torch.tensor([[-2.0, -3.0], [-1.7, -2.8], [-4.0, -3.2], [-1.4, -4.8]])

loss = dpo_loss(policy_logps, ref_logps, beta=0.1)
print(f"DPO loss: {loss.item():.4f}")

# 分析每个样本：
# batch 0: chosen_ratio=0.1, rejected_ratio=-0.5, diff=0.6 -> loss很小
# batch 1: chosen_ratio=0.1, rejected_ratio=-0.1, diff=0.2 -> loss中等
# batch 2: chosen_ratio=-0.2, rejected_ratio=0.1, diff=-0.3 -> loss很大（模型搞反了！）
# batch 3: chosen_ratio=0.1, rejected_ratio=-0.2, diff=0.3 -> loss较小
```

#### RLHF vs DPO 对比图

```
// 代码块
传统RLHF（三阶段流水线）：
  SFT -> 奖励模型RM -> PPO优化
  需要3次训练、3个模型、算力x3
  奖励模型70B参数 + PPO的不稳定性

DPO（一步到位）：
  SFT -> DPO直接优化
  只需2次训练、2个模型、算力x2
  省掉了奖励模型和PPO！
  用偏好数据直接做监督学习
```

#### beta 参数的作用

| beta 值 | 效果 | 类比 |
| --- | --- | --- |
| beta->0 | 无KL惩罚，大幅偏离参考 | 学生无约束 |
| beta=0.1 | 平衡探索和保守 | 老师给明确指导 |
| beta->inf | 几乎不偏离参考模型 | 学生被绑死 |

**beta 越大，DPO 越保守；beta 越小，DPO 越大胆。**

### 实际案例

#### Llama-3 的对齐

Meta Llama-3（8B和70B）SFT后直接用DPO做偏好对齐：

- SFT：1500万条高质量指令数据
- DPO：80万条偏好数据（chosen vs rejected）
- MT-Bench评分8.0，接近GPT-4的8.9

#### Mistral 7B

SFT用10万条数据，DPO用1万条偏好数据，7B参数模型超过多个10B+模型。

### 常见误区

- **DPO不需要训练数据**：仍需要偏好数据（chosen/rejected对），只是不需要训练奖励模型
- **DPO不需要参考模型**：仍需要参考模型（通常复用SFT模型），损失函数中KL项需要它
- **DPO是强化学习**：DPO是监督学习任务（二元分类），不是RL
- **DPO完全替代RLHF**：数学推理等需要复杂奖励的场景，GRPO可能更灵活

### 与其他知识点的关系

- 前驱：RLHF（第10天）
- 后继：GRPO（第12天）进一步去掉参考模型
- 在Roadmap中：第三阶微调与对齐

### 为什么重要

1. 工程友好：训练从3步降到2步，稳定性大幅提升
2. 数学优雅：证明了最优策略和奖励函数的等价关系
3. 工业界标配：Llama-3、Mistral、Qwen等
4. 降低门槛：不需要RL知识

### 小练习

1. 模型生成太保守时，应该调大还是调小beta？为什么？（答案：调小beta，减小KL惩罚）
2. 从Bradley-Terry模型出发，写出DPO损失函数的完整推导。

### 延伸阅读

1. [DPO论文](https://arxiv.org/abs/2305.18290) - Rafailov et al., NeurIPS 2023
2. [DPO数学推导](https://zhuanlan.zhihu.com/p/20922850916)
3. [HuggingFace TRL DPO实现](https://github.com/huggingface/trl)

---
