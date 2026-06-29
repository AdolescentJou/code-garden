# OpenClaw 检索记忆机制深度研究

**主题**: OpenClaw 检索记忆的机制  
**日期**: 2026-03-21  
**模式**: 深度研究  
**来源**: 官方文档 (docs/concepts/memory.md)

---

## 核心结论

OpenClaw 的记忆系统是**纯 Markdown 文件**（`MEMORY.md` 和 `memory/YYYY-MM-DD.md`），模型只"记住"写入磁盘的内容。通过两个核心工具实现检索：

1. **`memory_search`** — 语义搜索，基于向量 + 可选的 BM25 全文检索
2. **`memory_get`** — 按路径/行号精确读取

---

## 记忆文件结构

### 双层架构

| 文件 | 用途 | 加载规则 |
|------|------|----------|
| `memory/YYYY-MM-DD.md` | 每日日志（仅追加） | 读取今天 + 昨天 |
| `MEMORY.md` | 长期记忆精选 | 仅在主会话（私密）加载 |

### 写入时机

- **决策、偏好、持久事实** → `MEMORY.md`
- **日常笔记、运行上下文** → `memory/YYYY-MM-DD.md`
- 用户说"记住这个"时 → 必须写入文件（不要存 RAM）

---

## 检索工具详解

### memory_search

- **语义搜索**：使用向量嵌入（默认远程，可选本地）
- **目标分块**：约 400 tokens，80 tokens 重叠
- **返回**：片段文本（~700 字符上限）+ 文件路径 + 行范围 + 分数 + 提供商
- **支持混合搜索**：向量相似度 + BM25 关键词检索
- **后处理**（可选）：
  - MMR 重排序（去重）
  - 时间衰减（近者优先）

### memory_get

- 按路径精确读取 Markdown 文件
- 支持指定起始行和行数
- 文件不存在时优雅降级（返回空文本）

---

## 向量搜索配置

### 提供商（按优先级）

1. **本地** (`local`) — node-llama-cpp + GGUF 模型
2. **OpenAI** — text-embedding-3-small
3. **Gemini** — gemini-embedding-001 / 2-preview
4. **Voyage**
5. **Mistral**
6. **Ollama** — 自托管

### 本地模型

- 默认：`hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF`（约 0.6GB）
- 首次使用自动下载
- 需要 `pnpm approve-builds` + 重建 node-llama-cpp

### 支持的远程模型

- OpenAI: `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
- Gemini: `gemini-embedding-001` (768维), `gemini-embedding-2-preview` (8192 token, 3072维)
- Voyage, Mistral, Ollama

---

## 高级特性

### 混合搜索 (Hybrid Search)

结合向量语义匹配 + BM25 关键词检索：

```
finalScore = vectorWeight × vectorScore + textWeight × textScore
```

- 默认权重：70% 向量 + 30% 文本
- 解决向量搜索的"弱精确匹配"问题（如 ID、代码符号、错误字符串）

### MMR 重排序

- 启用后减少重复/相似的检索结果
- 参数 `lambda`：1.0 = 纯相关，0.0 = 纯多样
- 默认 0.7（平衡）

### 时间衰减 (Temporal Decay)

近期记忆优先：

```
decayedScore = score × e^(-λ × ageInDays)
```

- 默认半衰期 30 天
- 今日笔记：100%
- 7 天前：84%
- 30 天前：50%
- **不衰减**：`MEMORY.md` 和无日期文件

### QMD 后端（实验性）

可替换为 [QMD](https://github.com/tobi/qmd)：
- BM25 + 向量 + 重排序
- 本地优先
- 需要 Bun + SQLite（支持扩展）

---

## 自动记忆刷新

### 触发条件

会话接近自动压缩（compaction）时，OpenClaw 触发**静默代理轮次**，提醒模型在上下文压缩前写入持久记忆。

### 配置参数

```json5
{
  agents: {
    defaults: {
      compaction: {
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
        }
      }
    }
  }
}
```

- 默认启用
- 软阈值：`contextWindow - reserveTokensFloor - softThresholdTokens`
- 静默模式：提示包含 `NO_REPLY`，用户看不到

---

## 索引机制

### 索引内容

- 仅 Markdown 文件
- 存储位置：`~/.openclaw/memory/<agentId>.sqlite`

### 索引触发

1. 会话启动
2. 搜索时
3. 按时间间隔（可配置）
4. 文件变化监视（1.5s 防抖）

### 索引失效

- 嵌入提供商/模型/端点指纹改变
- 分块参数改变
- 自动重索引

---

## 向量缓存

可缓存块嵌入，避免重复计算：

```json5
{
  memorySearch: {
    cache: {
      enabled: true,
      maxEntries: 50000
    }
  }
}
```

---

## 多模态记忆（实验性）

支持从 `extraPaths` 索引图片/音频：

- 仅 Gemini embedding 2 支持
- 支持格式：`.jpg`, `.png`, `.webp`, `.mp3`, `.wav`, `.ogg` 等
- 搜索仍为文本，但可比较图片/音频嵌入

---

## 报告元数据

| 字段 | 值 |
|------|-----|
| 搜索主题 | OpenClaw检索记忆的机制 |
| 搜索时间 | 2026-03-21 11:06:00 |
| 搜索模式 | 深度 |
| 数据源 | 官方文档 |
| 交叉验证 | 部分（文档内交叉验证） |
| 整体置信度 | 高可信 - 85% |
| 可用数据源数 | 1/7 |
| 平台覆盖 | Web: ⚠️, 小红书: ⚠️, Reddit: ⚠️, 知乎: ⚠️, 微博: ⚠️, linux.do: ⚠️, V2EX: ⚠️ |

> 注：本次搜索基于官方文档（单源），因 Brave Search API 未配置无法进行多平台检索。配置 API Key 后可实现全平台交叉验证。

---

## 配置示例

```json5
agents: {
  defaults: {
    memorySearch: {
      provider: "openai",
      model: "text-embedding-3-small",
      hybrid: {
        enabled: true,
        vectorWeight: 0.7,
        textWeight: 0.3,
        mmr: { enabled: true, lambda: 0.7 },
        temporalDecay: { enabled: true, halfLifeDays: 30 }
      }
    }
  }
}
```
