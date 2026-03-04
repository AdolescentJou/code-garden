一、Dense（稠密）是什么意思
Dense（稠密） 是大模型的核心架构范式，指每次前向传播（推理 / 训练）时，模型所有参数都会被激活并参与计算，没有参数被 “跳过” 或 “闲置”。
核心特点：全参数激活、稠密连接、计算全覆盖
通俗理解：无论输入简单还是复杂，模型都会 “动用全部能力” 处理，像全能大厨做任何菜都用遍所有厨具
与稀疏 / MoE 的本质区别：Dense 是全量计算，MoE 是部分专家激活、稀疏计算
二、主流 Dense 模型（截至 2026 年 2 月）
以下是当前最主流的纯 Dense 架构大模型（不含 MoE 变体）：
1. 国际主流 Dense 模型
OpenAI：GPT-3、GPT-3.5、GPT-4（基础版）、GPT-4o（基础 Dense）
Meta：LLaMA 1/2/3、LLaMA 2–70B、LLaMA 3–70B/400B
Google DeepMind：Gemini 1.0/1.5（Pro/Ultra 基础 Dense）、PaLM 2
Anthropic：Claude 2、Claude 3（Opus/Sonnet/Haiku，纯 Dense）
Mistral：Mistral-7B/8x7B（Dense 部分）、Mixtral（基础 Dense 主干）
2. 国内主流 Dense 模型
字节跳动：Doubao（豆包）系列、Llama 2 中文微调版
阿里云：Qwen 2/2.5（7B/14B/32B/72B）、Qwen 3（0.6B/1.7B/4B/8B/14B/32B，纯 Dense）
01.AI：Yi-6B/34B、Yi-1.5（纯 Dense）
深度求索：DeepSeek-V2（7B/67B，纯 Dense）
智谱 AI：GLM-4、ChatGLM3/4（纯 Dense 主干）
三、Dense 模型的优缺点
✅ 优点
结构简单、训练稳定：梯度传播顺畅，训练过程更可控
推理一致性强：输出可预测、质量稳定，适合对可靠性要求高的场景
工程成熟：工具链、部署方案完善，单机 / 多机推理友好
表达能力均衡：全参数交互，适合通用理解、生成、推理任务
❌ 缺点
计算成本高：简单任务也需全量计算，算力 / 显存消耗大
扩展效率低：参数规模越大，训练 / 推理成本呈超线性增长
能效比低：大量参数在特定任务中 “闲置”，资源利用率不高
四、Dense vs MoE（快速对比）
表格
维度	Dense（稠密）	MoE（混合专家，稀疏）
计算方式	全参数激活	仅激活部分专家
参数利用	100% 参与计算	仅部分激活（如 10%–20%）
代表模型	GPT-4、LLaMA 3、Claude 3、Qwen 3	Mixtral 8x7B、DeepSeek-MoE、Qwen 3-MoE
优势	稳定、通用、易部署	大参数量、高效、低成本
劣势	算力消耗大	训练复杂、推理一致性略低