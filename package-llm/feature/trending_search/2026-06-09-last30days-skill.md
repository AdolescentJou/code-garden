# 【2026-06-09】last30days-skill - AI Agent 多源社交情报引擎研究报告

## last30days-skill — AI Agent 多源社交情报引擎

> **GitHub**: https://github.com/mvanhorn/last30days-skill
> **今日 Stars**: 34,945 ⭐（今日新增 3,558）
> **语言**: Python 98.3%
> **协议**: MIT
> **版本**: v3.3.2
> **研究日期**: 2026-06-09

---

### 一、项目简介

`last30days-skill` 是一个 **AI Agent Skill**，核心能力是：**用一条指令，并行搜索 Reddit、X（Twitter）、YouTube、HN、Polymarket、GitHub 等十余个平台，按用户真实互动量（点赞/点击/真实押注金额）打分，由 AI 合成一份有数据支撑的情报简报**。

它不是另一个搜索引擎，而是一个**"以人民的注意力为权重"的互联网情报聚合 Agent**。与 Google 不同，Google 聚合的是编辑和 SEO，而 `last30days` 聚合的是真实的社区声音。

项目原作者 mvanhorn 构建它的初衷是：**AI 领域变化太快，Reddit 和 X 的极客社区总是比训练数据先行几个月**——他需要一个工具来实时捕获这些一手信号。

---

### 二、核心功能详解

#### 2.1 多平台并行搜索

| 平台 | 信号 | 成本 |
| --- | --- | --- |
| Reddit | 帖子 + 顶层评论 + Upvote 数 | 免费（公共 JSON API） |
| Hacker News | 技术开发者共识，积分+评论数 | 免费 |
| Polymarket | 真实资金押注的预测市场赔率 | 免费 |
| GitHub | PR 速率、Star 数、Issue 讨论 | 免费 |
| X / Twitter | 热点讨论、专家线程 | 免费（浏览器 session） |
| YouTube | 完整字幕文稿搜索关键句 | 免费（yt-dlp） |
| TikTok / Instagram / Threads | 创作者内容 + 播放量 | ScrapeCreators（100次免费） |
| Bluesky | AT Protocol 去中心化社交 | Bluesky App Password 免费 |
| Perplexity Sonar | 带引用的网页搜索 | OpenRouter（按量付费） |
| Web | 博客、技术评测 | Brave Search（2000次/月免费） |

**关键设计**：所有源并行抓取，不是串行，整个 pipeline 只需约 3 分钟。

---

#### 2.2 V3 智能预研（Intelligent Pre-Research）

这是 v3 的核心杀手锏。旧版本直接用关键词搜索，v3 会先用 Python 预研引擎推断**谁是相关的**：

- 输入 `"OpenClaw"` → 自动推断出 `@steipete`、`r/openclaw`、`r/ClaudeCode`、相关 YouTube 频道
- 输入 `"Peter Steinberger"` → 自动映射 `@steipete`（X）+ `steipete`（GitHub）
- 支持双向解析：人名 → 公司、产品 → 创始人、品牌 → GitHub 仓库

正确的搜索对象 > 更多的关键词。

---

#### 2.3 跨源聚类合并（Cross-Source Cluster Merging）

同一事件在 Reddit、X、YouTube 上的讨论会被合并为一条 Cluster，而非展示三条独立条目——即使标题用词不同也能匹配（基于实体识别）。避免信息重复，突出事件的真实传播广度。

---

#### 2.4 双评分维度（Relevance + Fun Judge）

- **相关性评分**：按内容与话题的匹配度打分
- **Fun Judge v2**：额外评估幽默度和病毒性。Reddit 最犀利的吐槽和 X 上的金句会被融入简报的"Best Takes"板块

---

#### 2.5 HTML 可分享简报（--emit=html）

支持生成一个自包含、暗色模式、可打印的 HTML 文件，可直接拖入 Slack/邮件/Notion 分享。无 JS 依赖，离线可用。输出路径默认 `~/Documents/Last30Days/`。

---

#### 2.6 竞品自动对比（--competitors）

```
// 代码块
/last30days OpenAI --competitors
```

引擎自动发现前 2 名竞品（Anthropic、xAI），并行运行 3 条完整 pipeline，生成三方对比表。

---

#### 2.7 趋势监控（--store + watchlist）

通过 `--store` 持久化到 SQLite，配合 `scripts/watchlist.py` 实现定期执行，支持 Slack/Webhook 推送新发现，`scripts/briefing.py` 生成日/周摘要报告。

---

### 三、安装与使用方式

#### 3.1 安装（三选一）

```Shell
// 代码块
# 方式一：Claude Code（官方推荐，自动更新）
/plugin marketplace add mvanhorn/last30days-skill

# 方式二：通用 Agent Skills CLI（支持 50+ 宿主）
npx skills add mvanhorn/last30days-skill -g

# 方式三：OpenClaw
clawhub install last30days-official
```

**零配置启动**：Reddit、HN、Polymarket、GitHub 无需任何 API Key，装完即用。

---

#### 3.2 基础用法

```Shell
// 代码块
# 研究一个话题
/last30days Claude Code

# 研究一个人（自动关联其 X/GitHub）
/last30days Peter Steinberger

# 工具对比
/last30days OpenClaw vs Cursor vs Windsurf

# 带竞品自动发现的研究
/last30days OpenAI --competitors

# 生成可分享的 HTML 简报
/last30days Anthropic earnings --emit=html

# 会议/销售前快速研究对象
/last30days Elon Musk

# 旅行前研究
/last30days 上海迪士尼 最新动态
```

---

#### 3.3 进阶配置（可选 API Keys）

```Shell
// 代码块
# X/Twitter：用浏览器登录 x.com 即可（不需要 API）
# YouTube：
brew install yt-dlp

# TikTok/Instagram/Threads（共用一个 Key）：
export SCRAPECREATORS_API_KEY=your_key

# Bluesky：
export BLUESKY_APP_PASSWORD=your_app_password

# Web 搜索（2000次/月免费）：
export BRAVE_SEARCH_API_KEY=your_key

# macOS Keychain 存储（可选，更安全）：
bash skills/last30days/scripts/setup-keychain.sh
```

---

#### 3.4 趋势监控示例

```Python
// 代码块
# 定期追踪关键词，有新发现 Webhook 通知
python scripts/watchlist.py --topics "AI Agent,Claude Code,OpenClaw" \
  --store research.db --webhook https://hooks.slack.com/...

# 生成周报
python scripts/briefing.py --store research.db --period weekly
```

---

### 四、落地实践场景

#### 场景一：竞品情报追踪

技术/产品团队每天用 `/last30days [竞品名]` 自动汇聚竞品的社区反馈、GitHub PR 动向、技术博客评测，替代人工每天刷 Reddit 和 HN。

#### 场景二：会前尽调

见客户/合作方之前，`/last30days [对方公司/CEO名]` 获取最近 30 天的真实动向：投资新闻、争议事件、技术发布、社交媒体立场。比看 LinkedIn 全面得多。

#### 场景三：技术选型参考

`/last30days LangChain vs LlamaIndex vs CrewAI` 聚合开发者社区的真实吐槽和使用体验，帮助技术选型时快速了解"在真实生产中谁最靠谱"。

#### 场景四：舆情监控

品牌/PR 团队用 `--store` 持久化 + `watchlist.py` 定时追踪关键词，通过 Webhook 实时接收异常舆情信号。

#### 场景五：内容创作前调研

博主/Up主用 `/last30days [选题]` 获取过去 30 天最高互动量的相关内容，直接了解受众在讨论什么、槽点在哪，再结合 Reddit "Best Takes" 拿到金句素材。

#### 场景六：投资/Polymarket 赛前

`/last30days` 能拉取真实资金驱动的 Polymarket 赔率，结合社交舆情综合判断，辅助快速做出有数据支撑的观点。

---

### 五、技术架构简析

```
// 代码块
用户指令
   ↓
[Step 0.55: Pre-Research Brain] (Python)
   ↓ 解析实体：X handles, subreddits, GitHub repos, hashtags
   ↓
[并行 Pipeline]
  ├── Reddit Scraper    (公共 JSON，免费)
  ├── X Search         (Bird Node.js client)
  ├── YouTube          (yt-dlp + 字幕提取)
  ├── HN API           
  ├── Polymarket API   
  ├── GitHub API       
  ├── ScrapeCreators   (TikTok/Instagram/Threads)
  └── Brave/Perplexity 
   ↓
[双评分：Relevance Judge + Fun Judge]
   ↓
[Cross-Source Cluster Merging]
   ↓
[AI Synthesis] → Markdown 简报 / HTML 简报
   ↓
可选：--store → SQLite → watchlist.py → Webhook
```

Python 3.12+，Node.js（X 搜索 vendored client），1012 个测试用例，MIT 协议。

---

### 六、个人评价与建议

#### 优点

1. **"搜索人心"的设计哲学**：把 Upvote、播放量、真实资金（Polymarket）作为权重，逻辑上比 SEO 权重更接近"真相"
2. **零配置门槛极低**：Reddit + HN + GitHub + Polymarket 直接免费用，不需要注册任何 API
3. **V3 预研引擎是真正的 AI 化**：从"搜词"进化到"先理解再搜索"，这是质变
4. **生态整合完善**：Claude Code/Codex/Cursor/Gemini CLI 等 50+ 宿主均支持，OpenClaw 也是一等公民
5. **可监控化**：`--store` + `watchlist.py` 让它从一次性工具变成持续情报系统

#### 局限

1. **X / Twitter 搜索依赖浏览器 session**：不稳定，容易失效，需要定期重新登录
2. **ScrapeCreators 是付费瓶颈**：TikTok/Instagram 这类增量数据需要额外付费，100 次免费额度很快用完
3. **中文内容支持有限**：当前对小红书、微博、B站等中文平台的支持还在社区贡献阶段，质量参差
4. **需要 Python 3.12+ 环境**：对非技术用户安装略有门槛

#### 适合谁用

- **AI 技术从业者**：追踪 LLM 生态最快的方式，没有之一
- **产品/市场团队**：竞品调研、用户声音聚合
- **内容创作者**：热门选题和金句挖掘
- **投资人/分析师**：用真实资金信号辅助判断

#### 怎么上手最快

```Shell
// 代码块
# 装完直接跑，不需要任何配置
npx skills add mvanhorn/last30days-skill -g
/last30days Claude Code
```

第一次跑完，你会感叹——原来手动搜 Reddit 浪费了多少时间。

---

*研究时间：2026-06-09 | 数据来源：GitHub Trending Python Top1（今日 +3558 stars）*
