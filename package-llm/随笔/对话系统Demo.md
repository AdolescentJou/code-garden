技术设计方案 — 口语对话系统 Demo

本方案涵盖口语对话系统 MVP 所需的核心模块：语音录入、文字录入、大模型识别与语音/文字同步输出、对话信息存储。技术栈：前端 React + Vite + TailwindCSS，后端 NestJS，数据库本地 MySQL。

1. 语音录入与文字录入

1.1 语音录入

前端实现（浏览器 Web Speech API）：

实时语音识别：使用 webkitSpeechRecognition（Chrome）或 SpeechRecognition 标准 API，支持连续监听模式（continuous: true），用户说话时实时转录文本。

录音采集：通过 MediaRecorder API 采集原始音频（格式：WebM/OPUS 或 WAV），后端接收后按需转码。

状态管理：录音状态（idle / listening / processing / done）驱动 UI 交互（如按钮文案切换、波形动画）。

后端接口：

POST /api/conversation/audio：接收前端上传的音频文件（multipart/form-data），保存原始音频，触发 ASR 识别。

音频转文字（ASR）方案：

方案 A（推荐）：使用阿里云语音识别（一句话识别 API），支持实时短语音转文字，中英文混合识别，按调用量计费，有免费额度。备选：讯飞语音听写 API。

方案 B（备选）：使用讯飞语音听写 API（WebSocket 流式识别），支持实时返回识别结果，适合长语音场景。

1.2 文字录入

前端实现：

提供多行文本输入框，支持回车发送或按钮发送。

输入框上方显示当前会话场景（如 "At a restaurant"），辅助用户理解上下文。

支持语音/文字模式切换按钮。

后端接口：

POST /api/conversation/message：接收文字消息，body：{"sessionId": "string", "content": "string", "type": "text"}。

POST /api/conversation/audio：接收语音消息，body：表单含 sessionId + audioFile（二进制）。

2. 大模型识别与语音/文字同步输出

2.1 大模型对话

技术路线：

前端通过 WebSocket 或 SSE（Server-Sent Events）建立长连接，实现流式输出。

后端调用大模型 API（推荐通义千问 / 智谱 GLM-4 / Kimi），传入用户消息 + 系统 Prompt（角色设定、场景、语言风格）。

流式返回：后端逐 chunk 转发大模型输出，前端实时渲染文字。

系统 Prompt 示例：

You are a patient English conversation partner. The user is learning English and will chat with you in this scenario: [SCENE].
- Respond naturally in English, at a level appropriate for intermediate learners.
- Keep responses concise (1-3 sentences).
- Correct grammar mistakes gently inline.
- Do not translate the user's message; respond entirely in English.


后端接口：

POST /api/conversation/send：发送消息（语音或文字），流式返回大模型回复的文字内容。

2.2 文字输出

前端实现：

消息列表组件：每条消息包含发送者（user / assistant）、内容、时间戳。

流式渲染：逐字追加，使用 requestAnimationFrame 平滑打字机效果。

语法纠错高亮：大模型返回中标记错误（如 ~~I goes~~ → I go），前端用不同颜色渲染。

2.3 语音输出（TTS）

技术方案：

方案 A（推荐）：使用阿里云语音合成（长文本合成 API），支持多种音色选择与语速调节（0.5~2.0x），按调用量计费，有免费额度。备选：讯飞语音合成 API。

方案 B（备选）：使用讯飞语音合成 API，支持多情感音色、语速调节，适合需要更自然语音效果的场景。

前端播放控制：

每条助手消息附带 "播放" 按钮，点击后播放 TTS 音频。

语速调节滑块：0.5x ~ 2.0x，实时调整 audioElement.playbackRate。

音色选择：下拉菜单切换（如 "Natural (female)" / "Warm (male)" / "Bright (female)"）。

后端接口：

POST /api/tts/synthesize：生成语音，body：{"text": "string", "voice": "string", "speed": number}，返回 audioUrl 或直接返回音频流。

2.4 语音/文字同步

每条助手消息同时包含文字内容和语音 URL，前端并行渲染：

{
  "id": "msg-001",
  "role": "assistant",
  "content": "Nice to meet you! What are you going to do today?",
  "audioUrl": "/media/tts/msg-001.mp3",
  "voice": "xiaoyun",
  "speed": 1.0,
  "timestamp": "2026-06-28T14:30:00Z",
  "grammarCorrections": [
    {"original": "I goes", "corrected": "I go", "position": [5, 10]}
  ]
}


3. 对话信息存储

3.1 数据库设计（MySQL）

以下是为 MVP 设计的核心表结构：

3.1.1 用户表（user）

字段名

类型

说明

id

BIGINT AUTO_INCREMENT PRIMARY KEY

用户ID

email

VARCHAR(128) UNIQUE

邮箱（注册/登录账号）

nickname

VARCHAR(128)

昵称

created_at

DATETIME DEFAULT CURRENT_TIMESTAMP

创建时间

updated_at

DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

更新时间

3.1.2 对话会话表（conversation_session）

字段名

类型

说明

id

BIGINT AUTO_INCREMENT PRIMARY KEY

会话ID

user_id

BIGINT FOREIGN KEY REFERENCES user(id)

用户ID

scene

VARCHAR(128)

对话场景（如"At a restaurant"）

title

VARCHAR(256)

会话标题（自动生成或用户编辑）

status

ENUM('active', 'completed', 'archived') DEFAULT 'active'

会话状态

created_at

DATETIME DEFAULT CURRENT_TIMESTAMP

创建时间

updated_at

DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

更新时间

3.1.3 对话消息表（conversation_message）

字段名

类型

说明

id

BIGINT AUTO_INCREMENT PRIMARY KEY

消息ID

session_id

BIGINT FOREIGN KEY REFERENCES conversation_session(id)

会话ID

role

ENUM('user', 'assistant')

发送者角色

content_type

ENUM('text', 'audio')

内容类型

content_text

TEXT

文字内容（ASR识别结果或用户输入）

audio_original_url

VARCHAR(512)

用户原始语音本地路径（如 /media/uploads/xxxx.webm）

audio_tts_url

VARCHAR(512)

助手TTS语音URL（生成后填充）

tts_voice

VARCHAR(64)

使用的音色标识

tts_speed

DECIMAL(3,2) DEFAULT 1.0

语速倍数（0.5~2.0）

grammar_corrections

JSON

语法纠错结果（assistant消息才有）

created_at

DATETIME DEFAULT CURRENT_TIMESTAMP

创建时间

3.1.4 场景配置表（scene_config）

字段名

类型

说明

id

BIGINT AUTO_INCREMENT PRIMARY KEY

场景ID

name

VARCHAR(128) UNIQUE

场景名称（如'restaurant'）

display_name

VARCHAR(256)

显示名称（如"At a restaurant"）

system_prompt

TEXT

该场景的系统Prompt模板

difficulty

ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner'

难度等级

created_at

DATETIME DEFAULT CURRENT_TIMESTAMP

创建时间

3.2 重复听取模型语音

存储策略：

TTS 语音文件生成后存入 audio_tts_url 字段，保存在本地 /media 目录（如 /media/tts/xxxx.mp3），通过 NestJS 静态文件服务直接访问。

前端消息列表支持按时间倒序加载历史会话，点击进入后可重新播放所有助手语音。

后端提供历史会话列表接口：GET /api/conversation/sessions?userId=xxx，消息详情接口：GET /api/conversation/sessions/{id}/messages。

语音缓存策略：

同一文字内容的 TTS 只生成一次，后续直接复用已生成的音频 URL，避免重复调用 TTS API。

缓存键设计：tts:{md5(text)}:{voice}:{speed}。

4. 需要准备的 Appkey

以下服务均使用国内可用的外部 API，有免费额度，网络访问稳定：

服务

用途

推荐方案

备注

ASR 语音识别

用户语音转文字

阿里云语音识别 / 讯飞语音听写

阿里云有免费额度，支持中英文。讯飞 WebSocket 流式识别。

TTS 语音合成

大模型回复转语音

阿里云语音合成 / 讯飞语音合成

阿里云多种音色 + 语速调节。讯飞支持情感音色。均有免费额度。

大模型 API

对话生成

通义千问 API / 智谱 GLM-4 API / Kimi API

均支持流式输出（stream），国内访问稳定，有免费额度。

本地文件存储

存储TTS音频文件及用户上传音频

本地磁盘（/media 目录），NestJS StaticModule 提供静态访问

零成本，无需额外服务，本地磁盘直接读写。

各服务 API 端点参考：

ASR：阿里云一句话识别（REST API）或讯飞语音听写（WebSocket API）

TTS：阿里云语音合成（REST API）或讯飞语音合成（WebSocket API）

大模型：通义千问（POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions，参数 stream=true）或智谱 GLM-4 API

建议：以上国内服务均有免费额度，国内网络访问稳定，适合 MVP 快速跑通。通义千问兼容 OpenAI API 格式，可无缝切换。

5. 前端页面架构

前端采用 React + Vite + TailwindCSS 技术栈，组件架构如下：

src/
├── main.tsx              # 应用入口
├── App.tsx               # 根组件（路由核心）
├── index.css             # TailwindCSS 全局样式
├── components/           # 可复用组件
│   ├── AudioRecorder.tsx    # 语音录制组件（MediaRecorder + 波形可视化）
│   ├── MessageBubble.tsx    # 单条消息气泡（区分 user/assistant）
│   ├── VoicePlayer.tsx      # 语音播放控件（播放/暂停/语速调节）
│   ├── SceneSelector.tsx    # 场景选择下拉框
│   ├── TypingIndicator.tsx  # 打字机动画
│   └── GrammarTooltip.tsx  # 语法纠错浮层
├── pages/               # 页面级组件
│   ├── HomePage.tsx         # 首页（会话列表 + 新建会话）
│   ├── ChatPage.tsx         # 对话页面（核心交互）
│   └── HistoryPage.tsx     # 历史会话列表
├── hooks/               # 自定义 Hooks
│   ├── useSpeechRecognition.ts  # Web Speech API 封装
│   ├── useWebSocket.ts          # WebSocket 连接管理
│   └── useAudioPlayback.ts      # 音频播放状态管理
├── services/            # API 服务层
│   ├── api.ts               # axios 实例 + 请求拦截
│   ├── conversation.ts     # 对话相关 API
│   └── tts.ts              # TTS 语音合成 API
├── stores/              # 状态管理（Zustand）
│   ├── chatStore.ts        # 当前会话状态（消息列表、输入框、录音状态）
│   ├── sessionStore.ts     # 会话列表状态
│   └── ttsStore.ts         # TTS 配置（音色、语速）
├── types/               # TypeScript 类型定义
│   ├── conversation.ts     # Message、Session、Scene 类型
│   └── tts.ts              # VoiceConfig、PlayState 类型
└── utils/               # 工具函数
    ├── grammar.ts           # 语法纠错高亮工具
    └── audioUtils.ts        # 音频格式转换工具


5.1 核心页面说明

5.1.1 HomePage（首页）

功能：展示用户的所有对话会话列表，支持新建会话。

组件树：HomePage → SessionCard（列表项）+ NewSessionButton（新建按钮）

状态：sessionStore.sessions（会话列表）、sessionStore.activeSession（当前选中）

交互：点击会话卡片 → 路由跳转 /chat/:sessionId；点击新建 → 创建新会话后跳转

5.1.2 ChatPage（对话页面）

功能：核心对话交互页面，包含消息列表、输入区、TTS 播放控制。

组件树：ChatPage → Header（场景名 + 退出）→ MessageList（消息列表）→ InputArea（输入区）→ TTSBar（TTS 控制面板）

状态：chatStore.messages（消息列表）、chatStore.isRecording（录音中）、chatStore.isStreaming（流式回复中）

交互：文字输入 → 点击发送 / 回车 → 调用 POST /api/conversation/send；语音录制 → 点击麦克风 → useSpeechRecognition → 识别完成后发送

流式渲染：大模型通过 SSE text/event-stream 返回，前端逐 chunk 追加到 chatStore.messages，MessageBubble 监听变化并渲染

5.1.3 HistoryPage（历史页面）

功能：查看历史会话列表，支持重新进入对话并播放历史语音。

组件树：HistoryPage → SessionCard（列表项，含语音时长统计）→ FilterBar（按场景/时间筛选）

状态：sessionStore.history（历史会话）、ttsStore.playingMessageId（当前播放的消息 ID）

交互：点击会话 → 跳转 ChatPage 并加载历史消息；点击语音播放按钮 → 从 audio_tts_url 加载音频并播放

前端页面架构图：

┌─────────────────────────────────┐
│           App.tsx                │
│  (Router: BrowserRouter)         │
├─────────────────────────────────┤
│  /           → HomePage          │
│  /chat/:id  → ChatPage          │
│  /history   → HistoryPage       │
├─────────────────────────────────┤
│  ChatPage 结构：             │
│  ┌─────────────────────────────┐ │
│  │  Header: 场景名 + 退出       │ │
│  ├─────────────────────────────┤ │
│  │  MessageList                │ │
│  │  ├─ MessageBubble (user)    │ │
│  │  │  ├─ 文字内容               │ │
│  │  │  ├─ 语音播放按钮 (可选)    │ │
│  │  │  └─ 语法纠错浮层 (可选)    │ │
│  │  ├─ MessageBubble (assistant)│ │
│  │  │  ├─ 打字机效果渲染        │ │
│  │  │  ├─ 语音播放按钮          │ │
│  │  │  └─ 语法纠错高亮          │ │
│  │  └─ TypingIndicator        │ │
│  ├─────────────────────────────┤ │
│  │  InputArea                  │ │
│  │  ├─ 文字输入框              │ │
│  │  ├─ 麦克风按钮 (语音模式)    │ │
│  │  ├─ 发送按钮                │ │
│  │  └─ 模式切换 (语音/文字)    │ │
│  ├─────────────────────────────┤ │
│  │  TTSBar: 音色选择 + 语速滑块│ │
│  └─────────────────────────────┘ │
└─────────────────────────────────┘


6. 后端类设计（NestJS）

后端采用 NestJS + TypeScript，模块划分如下：

src/
├── main.ts                      # 应用入口
├── app.module.ts                # 根模块
├── app.controller.ts            # 根控制器
├── modules/
│   ├── auth/                     # 认证模块
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── strategies/          # JWT 策略（邮箱注册/登录）
│   ├── conversation/             # 对话核心模块
│   │   ├── conversation.module.ts
│   │   ├── conversation.controller.ts
│   │   ├── conversation.service.ts
│   │   ├── conversation.gateway.ts  # WebSocket Gateway
│   │   ├── dto/                  # 数据传输对象
│   │   │   ├── create-message.dto.ts
│   │   │   ├── send-message.dto.ts
│   │   │   └── audio-upload.dto.ts
│   │   ├── entities/            # TypeORM 实体
│   │   │   ├── user.entity.ts
│   │   │   ├── session.entity.ts
│   │   │   └── message.entity.ts
│   │   └── interfaces/         # 外部服务接口
│   │       ├── asr.interface.ts   # ASR 服务接口
│   │       └── llm.interface.ts   # 大模型 API 接口
│   ├── tts/                    # TTS 模块
│   │   ├── tts.module.ts
│   │   ├── tts.controller.ts
│   │   ├── tts.service.ts
│   │   ├── dto/synthesize.dto.ts
│   │   ├── entities/tts-cache.entity.ts
│   │   └── interfaces/tts.interface.ts
│   └── scene/                 # 场景管理模块
│       ├── scene.module.ts
│       ├── scene.controller.ts
│       ├── scene.service.ts
│       └── entities/scene-config.entity.ts
├── common/
│   ├── interceptors/              # 拦截器
│   │   ├── response.interceptor.ts  # 统一响应格式
│   │   └── error.interceptor.ts     # 全局错误处理
│   ├── filters/                   # 异常过滤器
│   │   └── http-exception.filter.ts
│   ├── pipes/                     # 管道
│   │   └── validation.pipe.ts      # 请求参数校验
│   ├── decorators/                # 装饰器
│   │   ├── auth.decorator.ts        # 认证装饰器
│   │   └── roles.decorator.ts       # 角色装饰器
│   └── utils/
│       ├── md5.ts                 # MD5 工具（TTS 缓存键）
│       └── stream.ts              # 流式响应工具
├── config/                       # 配置文件
│   ├── database.config.ts
│   ├── llm.config.ts
│   └── tts.config.ts
└── swagger/                      # API 文档
    └── swagger.config.ts


6.1 核心类说明

6.1.1 ConversationService（核心业务逻辑）

import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LLMService } from './interfaces/llm.interface';
import { ASRService } from './interfaces/asr.interface';
import { Session } from './entities/session.entity';
import { Message } from './entities/message.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Session) private sessionRepo: Repository<Session>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @Inject('LLM_SERVICE') private llmService: LLMService,
    @Inject('ASR_SERVICE') private asrService: ASRService,
  ) {}

  /** 创建新会话 */
  async createSession(userId: number, sceneId: number): Promise<Session> {
    const session = this.sessionRepo.create({ userId, sceneId, title: '新会话' });
    return this.sessionRepo.save(session);
  }

  /** 发送消息（文字） */
  async sendMessage(dto: SendMessageDto): Promise<{ messageId: number }> {
    // 1. 保存用户消息
    const userMessage = await this.messageRepo.save({
      sessionId: dto.sessionId,
      role: 'user',
      contentType: 'text',
      contentText: dto.content,
    });

    // 2. 调用 LLM 生成回复
    const assistantContent = await this.llmService.chat({
      sessionId: dto.sessionId,
      userMessage: dto.content,
    });

    // 3. 保存助手消息
    const assistantMessage = await this.messageRepo.save({
      sessionId: dto.sessionId,
      role: 'assistant',
      contentType: 'text',
      contentText: assistantContent.text,
      grammarCorrections: assistantContent.grammarCorrections,
    });

    return { messageId: assistantMessage.id };
  }

  /** 发送消息（语音） */
  async sendAudioMessage(dto: AudioUploadDto): Promise<{ messageId: number }> {
    // 1. ASR 识别
    const text = await this.asrService.transcribe(dto.audioFile);

    // 2. 保存用户消息（含原始音频）
    const userMessage = await this.messageRepo.save({
      sessionId: dto.sessionId,
      role: 'user',
      contentType: 'audio',
      contentText: text,
      audioOriginalUrl: dto.audioFile.path,
    });

    // 3. 调用 LLM（同上）
    const assistantContent = await this.llmService.chat({
      sessionId: dto.sessionId,
      userMessage: text,
    });

    // 4. 保存助手消息
    const assistantMessage = await this.messageRepo.save({
      sessionId: dto.sessionId,
      role: 'assistant',
      contentType: 'text',
      contentText: assistantContent.text,
    });

    return { messageId: assistantMessage.id };
  }

  /** 获取会话消息列表 */
  async getMessages(sessionId: number): Promise<Message[]> {
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }
}


6.1.2 LLMService（大模型服务）

import { Injectable, Inject } from '@nestjs/common';
import { LLMProvider } from './providers/llm.provider';
import { SceneService } from '../scene/scene.service';

export interface ChatResponse {
  text: string;
  grammarCorrections?: GrammarCorrection[];
  grammarCorrections?: GrammarCorrection[];
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
  position: [number, number];
}

@Injectable()
export class LLMService {
  constructor(
    @Inject('LLM_PROVIDER') private provider: LLMProvider,
    private sceneService: SceneService,
  ) {}

  /** 对话生成（流式） */
  async chat(options: { sessionId: number; userMessage: string }): Promise<ChatResponse> {
    const session = await this.sessionRepo.findOne({ where: { id: options.sessionId } });
    const scene = await this.sceneService.getById(session.sceneId);

    const systemPrompt = scene.systemPrompt;
    const messages = await this.messageRepo.find({
      where: { sessionId: options.sessionId },
      order: { createdAt: 'ASC' },
      take: 20, // 上下文窗口：最近20条
    });

    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.contentText,
    }));

    // 调用大模型（流式）
    const stream = await this.provider.chatStream({
      systemPrompt,
      messages: formattedMessages,
      model: 'qwen-plus',
    });

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk;
    }

    // 语法纠错
    const grammarCorrections = await this.analyzeGrammar(options.userMessage);

    return { text: fullText, grammarCorrections };
  }

  /** 语法纠错分析 */
  private async analyzeGrammar(text: string): Promise<GrammarCorrection[]> {
    // 调用 LLM 分析语法错误
    const prompt = `Analyze grammar mistakes in the following English text. Return corrections as JSON array with fields: original, corrected, position [start, end].

Text: ${text}`;

    const response = await this.provider.chatCompletion({ prompt, model: 'qwen-plus' });
    return JSON.parse(response.text) as GrammarCorrection[];
  }
}


6.1.3 TTSService（语音合成服务）

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TtsCache } from './entities/tts-cache.entity';
import { TTSProvider } from './interfaces/tts.interface';
import { Md5 } from 'ts-md5';

@Injectable()
export class TTSService {
  constructor(
    @InjectRepository(TtsCache) private cacheRepo: Repository<TtsCache>,
    @Inject('TTS_PROVIDER') private provider: TTSProvider,
  ) {}

  /** 语音合成（带缓存） */
  async synthesize(dto: SynthesizeDto): Promise<{ audioUrl: string }> {
    const cacheKey = `tts:${Md5.hashStr(dto.text)}:${dto.voice}:${dto.speed}`;

    // 1. 查缓存
    const cached = await this.cacheRepo.findOne({ where: { cacheKey } });
    if (cached) {
      return { audioUrl: cached.audioUrl };
    }

    // 2. 调用 TTS 服务
    const audioBuffer = await this.provider.synthesize({
      text: dto.text,
      voice: dto.voice,
      speed: dto.speed,
    });

    // 3. 写入本地文件（返回访问 URL）
    const audioUrl = await this.saveToLocal(audioBuffer, `${cacheKey}.mp3`);

    // 4. 写入缓存
    await this.cacheRepo.save({ cacheKey, audioUrl, text: dto.text, voice: dto.voice, speed: dto.speed });

    return { audioUrl };
  }

  /** 获取支持的音色列表 */
  getSupportedVoices(): VoiceConfig[] {
    return [
      { id: 'xiaoyun', name: '小云（女声）', language: 'zh/en' },
      { id: 'xiaoxia', name: '小夏（男声）', language: 'zh/en' },
      { id: 'siyue', name: '思月（女声）', language: 'zh/en' },
    ];
  }
}


6.1.4 ConversationGateway（WebSocket 流式推送）

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConversationService } from './conversation.service';
import { LLMService } from './llm.service';

@WebSocketGateway(3001, { cors: true })
export class ConversationGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private conversationService: ConversationService,
    private llmService: LLMService,
  ) {}

  /** 发送文字消息（WebSocket 流式返回） */
  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() data: { sessionId: number; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    // 保存用户消息
    const userMessage = await this.conversationService.saveUserMessage(data);

    // 通过 WebSocket 推送用户消息到前端
    client.emit('message', {
      id: userMessage.id,
      role: 'user',
      content: data.content,
      timestamp: new Date().toISOString(),
    });

    // 调用 LLM 并流式推送
    const stream = await this.llmService.chatStream({
      sessionId: data.sessionId,
      userMessage: data.content,
    });

    let assistantContent = '';
    for await (const chunk of stream) {
      assistantContent += chunk;
      // 逐 chunk 推送到前端
      client.emit('stream_chunk', { chunk });
    }

    // 流式结束信号
    client.emit('stream_end', {
      id: 'assistant-' + Date.now(),
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date().toISOString(),
    });

    // 保存助手消息
    await this.conversationService.saveAssistantMessage(data.sessionId, assistantContent);
  }
}


7. 数据流转图

7.1 文字输入流程

用户输入文字
    │
    ▼
┌─────────────────┐
│  Frontend:      │
│  InputArea      │
│  (ChatPage.tsx) │
└────────┬────────┘
         │ POST /api/conversation/send
         │ { sessionId, content, type: 'text' }
         ▼
┌─────────────────┐
│  NestJS:        │
│  Conversation   │
│  Controller     │
│  → Service      │
│  → MessageRepo  │  ← 保存 user 消息到 MySQL
└────────┬────────┘
         │ 调用 LLMService.chat()
         │ → LLMProvider.chatStream()
         │ → 外部大模型 API (stream=true)
         ▼
┌─────────────────┐
│  NestJS:        │
│  LLMService     │
│  → Grammar      │  ← 语法纠错分析
│  → MessageRepo  │  ← 保存 assistant 消息
└────────┬────────┘
         │ SSE / WebSocket 流式返回
         │ { role, content, grammarCorrections }
         ▼
┌─────────────────┐
│  Frontend:      │
│  chatStore      │  ← 更新消息列表
│  MessageBubble  │  ← 打字机效果渲染
│  GrammarTooltip │  ← 语法纠错高亮
└─────────────────┘


7.2 语音输入流程

用户点击麦克风
    │
    ▼
┌──────────────────────┐
│  Frontend:           │
│  AudioRecorder.tsx   │
│  → useSpeech        │  ← Web Speech API 实时识别
│  → MediaRecorder     │  ← 录音采集 (WebM/OPUS)
└──────────┬───────────┘
           │ POST /api/conversation/audio
           │ multipart/form-data: sessionId + audioFile
           ▼
┌──────────────────────┐
│  NestJS:             │
│  Conversation        │
│  Controller          │
│  → Conversation      │
│    Service           │
│  → ASRService        │  ← 调用 ASR API (阿里云 / 讯飞)
│  → MessageRepo       │  ← 保存 user 消息 + 原始音频 URL
└──────────┬───────────┘
           │ 识别文本作为后续输入
           │ → 同文字输入流程调用 LLM
           ▼
┌──────────────────────┐
│  NestJS:             │
│  LLMService          │  ← 生成助手回复
│  → TTSService        │  ← 语音合成 (缓存优先)
│  → MessageRepo       │  ← 保存 audio_tts_url
└──────────┬───────────┘
           │ SSE / WebSocket 流式返回
           │ { role, content, audioUrl, voice, speed }
           ▼
┌──────────────────────┐
│  Frontend:           │
│  chatStore           │  ← 更新消息列表
│  VoicePlayer         │  ← 播放 TTS 语音
│  MessageBubble       │  ← 渲染文字 + 播放按钮
└──────────────────────┘


7.3 TTS 语音播放流程

用户点击 "播放" 按钮
    │
    ▼
┌─────────────────┐
│  Frontend:      │
│  VoicePlayer    │
│  → useAudio     │  ← audioElement 加载 audio_tts_url
│  → playbackRate │  ← 用户设置的语速倍数
│  → voiceSelect  │  ← 用户选择的音色
└────────┬────────┘
         │ 若音频未生成 → POST /api/tts/synthesize
         │ { text, voice, speed }
         ▼
┌─────────────────┐
│  NestJS:        │
│  TTSController  │
│  → TTSService   │
│  → TtsCacheRepo │  ← 查缓存 (md5(text)+voice+speed)
│  → TTSProvider  │  ← 调用 TTS API (合成)
│  → Storage      │  ← 写入本地 /media 目录
│  → TtsCacheRepo │  ← 写入缓存
└────────┬────────┘
         │ 返回 audioUrl
         ▼
┌─────────────────┐
│  Frontend:      │
│  audioElement   │  ← src = audioUrl, play()
│  playbackRate   │  ← 实时调节 (0.5~2.0x)
└─────────────────┘


7.4 历史会话回放流程
用户进入 HistoryPage
    │
    ▼
┌─────────────────┐
│  Frontend:      │
│  HistoryPage    │
│  → sessionStore │  ← GET /api/conversation/sessions
└────────┬────────┘
         │ 会话列表返回
         ▼
┌─────────────────┐
│  用户点击会话   │
│  → 路由跳转     │
└────────┬────────┘
         │ GET /api/conversation/sessions/{id}/messages
         ▼
┌─────────────────┐
│  NestJS:        │
│  Conversation   │
│  Controller     │
│  → MessageRepo  │  ← 查询所有消息 (含 audio_tts_url)
└────────┬────────┘
         │ 返回完整消息列表
         ▼
┌─────────────────┐
│  Frontend:      │
│  ChatPage       │  ← 加载历史消息
│  VoicePlayer    │  ← audio_tts_url → 播放
│  MessageBubble  │  ← 渲染历史消息
└─────────────────┘
