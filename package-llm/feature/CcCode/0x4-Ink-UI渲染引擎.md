# 0x4 Ink UI 渲染引擎——用 React 驱动终端界面

> *系列：Claude Code 源码深度研究 · 专题 04 *
> *版本：v2.1.88 · 文件：*`*src/ink/*`

---

### 一、从一行流式输出说起

Claude 在回复你的时候，文字是一个字一个字地出现的。你滚动屏幕，历史消息还在；你用鼠标选中一段文字，高亮跟着走；你搜索关键词，匹配项立刻变色。

表面上看，这不就是普通的终端输出吗？打印字符，换行，完事。

但真实的实现远比这复杂。终端不是浏览器，没有 DOM、没有 CSS、没有 GPU 合成层——只有一个字符网格和 ANSI 转义序列。要在这个原始的画布上实现流畅的 UI，Claude Code 内置了一套完整的渲染引擎：React 组件树、Flexbox 布局、帧差分算法、宽字符处理、多终端兼容。

这篇文章要带你深入这套渲染引擎，看清楚每一帧画面背后的完整渲染链路。

> Ink 渲染引擎在启动流程的最后阶段被初始化（→ 参见**专题 12**：启动流程）；渲染调度的 16ms 节流与 `queryLoop` 的流式输出协同工作（→ 参见**专题 01**：查询引擎与对话循环）。

---

### 二、整体架构：React → DOM → Yoga → Screen → ANSI

```TypeScript
React 组件树（JSX）
        |
        | react-reconciler（自定义渲染器）
        v
虚拟 DOM（ink-box / ink-text / ink-root）
        |
        | Yoga（Facebook 的 Flexbox 引擎，WASM）
        v
布局计算（每个节点的 x/y/width/height）
        |
        | renderNodeToOutput
        v
Screen Buffer（二维字符网格，每格含 char/style/hyperlink）
        |
        | LogUpdate（帧差分）
        v
Diff（Patch 数组：cursorMove/styleStr/stdout/clear...）
        |
        | optimizer（合并/去重）
        v
ANSI 字节序列 → stdout
```

这条流水线每帧（16ms，约 60fps）执行一次，只有变化的部分才会写入终端。

---

### 三、自定义 React Reconciler

```TypeScript
// src/ink/reconciler.ts
const reconciler = createReconciler<ElementNames, Props, DOMElement, ...>({
  getRootHostContext: () => ({ isInsideText: false }),

  // React 提交后触发重新渲染
  resetAfterCommit(rootNode) {
    rootNode.onRender?.()  // 调度 scheduleRender（throttle 16ms）
  },

  // 创建 DOM 节点
  createInstance(type, props, rootContainer, hostContext, fiber) {
    const node = createNode(type)
    // 从 Fiber 捕获组件调用链（调试用）
    if (isDebugRepaintsEnabled()) {
      node.debugOwnerChain = getOwnerChain(fiber)
    }
    for (const [key, value] of Object.entries(props)) {
      applyProp(node, key, value)
    }
    return node
  },

  // 创建文本节点
  createTextInstance(text) {
    return createTextNode(text)
  },

  // 属性更新：只传 diff（变化的属性）
  prepareUpdate(instance, type, oldProps, newProps) {
    return diff(oldProps, newProps)  // 返回 null 表示无变化
  },

  commitUpdate(instance, updatePayload, type, oldProps, newProps) {
    for (const [key, value] of Object.entries(updatePayload)) {
      applyProp(instance, key, value)
    }
  },
})
```

Ink 实现了完整的 React Reconciler 接口，把 React 的虚拟 DOM 映射到自己的 DOM 树（`ink-box`、`ink-text` 等节点），而不是浏览器 DOM。

关键优化：`prepareUpdate` 只返回变化的属性（diff），`commitUpdate` 只应用这些变化，避免了全量属性重写。

---

### 四、虚拟 DOM：7 种节点类型

```TypeScript
// src/ink/dom.ts
export type ElementNames =
  | 'ink-root'          // 根节点，持有 FocusManager
  | 'ink-box'           // 容器（对应 <Box>），支持 Flexbox
  | 'ink-text'          // 文本容器（对应 <Text>）
  | 'ink-virtual-text'  // 虚拟文本（不占布局空间）
  | 'ink-link'          // 超链接（OSC 8 协议）
  | 'ink-progress'      // 进度条（OSC 9;4 协议）
  | 'ink-raw-ansi'      // 原始 ANSI 序列直通
```

每个 `DOMElement` 节点持有：

- `yogaNode`：对应的 Yoga 布局节点
- `style`：CSS-like 样式（flexDirection、padding、color 等）
- `scrollTop/scrollHeight`：滚动状态
- `_eventHandlers`：鼠标/键盘事件处理器（与 attributes 分离，避免触发不必要的重渲染）

---

### 五、Yoga：终端里的 Flexbox

Yoga 是 Facebook 开发的跨平台 Flexbox 布局引擎，原本用于 React Native。Ink 把它编译成 WASM，在 Node.js 里运行。

```TypeScript
// 布局计算流程（每次 React commit 后）
this.rootNode.yogaNode.setWidth(this.terminalColumns)
this.rootNode.yogaNode.calculateLayout(this.terminalColumns)
// 之后每个节点的 getComputedLeft/Top/Width/Height 都有了值
```

Yoga 的性能指标（每帧都会记录）：

```TypeScript
{
  ms: number,        // 布局计算耗时
  visited: number,   // 访问的节点数
  measured: number,  // 调用 measureFunc 的次数（文本宽度计算）
  cacheHits: number, // 单槽缓存命中次数
  live: number,      // 存活的 Yoga 节点数（监控内存泄漏）
}
```

文本宽度计算（`measureFunc`）是 Yoga 最昂贵的操作，因为需要处理宽字符（中文占 2 格、emoji 可能占 1 或 2 格）。Ink 用 `line-width-cache.ts` 缓存已计算过的行宽，避免重复计算。

---

### 六、Screen Buffer：字符网格

```TypeScript
// src/ink/screen.ts
// 每个 Cell 存储：
// - char: 字符（通过 CharPool intern 为整数 ID）
// - styleId: 样式（通过 StylePool intern 为整数 ID）
// - hyperlink: 超链接（通过 HyperlinkPool intern 为整数 ID）
// - width: CellWidth.Single(1) | CellWidth.Double(2) | CellWidth.SpacerTail(0)
```

三个 Pool（字符串驻留池）是关键的内存优化：

```TypeScript
export class CharPool {
  private strings: string[] = [' ', '']  // 0=空格, 1=空
  private ascii: Int32Array = initCharAscii()  // ASCII 快速路径

  intern(char: string): number {
    // ASCII 字符：直接数组查找，O(1)
    if (char.length === 1 && char.charCodeAt(0) < 128) {
      return this.ascii[char.charCodeAt(0)]
    }
    // 非 ASCII：Map 查找
    return this.stringMap.get(char) ?? this.addNew(char)
  }
}
```

通过驻留，相同字符在所有 Cell 中共享同一个整数 ID。帧差分时比较整数而非字符串，速度快 10 倍以上。

**双缓冲**：Ink 维护 `frontFrame`（上一帧）和 `backFrame`（当前帧），渲染完成后交换。差分算法比较两帧的 Screen Buffer，只输出变化的 Cell。

---

### 七、LogUpdate：帧差分引擎

`LogUpdate` 是 Ink 的核心差分引擎，负责把两帧 Screen Buffer 的差异转换为 Patch 序列。

```TypeScript
// src/ink/log-update.ts
render(prevFrame: Frame, frame: Frame, altScreen: boolean, syncOutput: boolean): Diff {
  // 主屏模式：基于行的差分（log-update 经典算法）
  // 全屏模式：基于 Cell 的差分（更精细）
}
```

#### 7.1 主屏模式（非全屏）

经典的 log-update 算法：

1. 计算新内容的行数
2. 用 `\x1b[{n}A`（光标上移 n 行）回到起点
3. 逐行比较，只重写变化的行
4. 用 `\x1b[K`（清除行尾）清除旧内容

#### 7.2 全屏模式（alt-screen）

基于 Cell 的精细差分：

```TypeScript
// diffEach：逐 Cell 比较，只输出变化的 Cell
diffEach(prevScreen, nextScreen, (x, y, prevCell, nextCell) => {
  if (prevCell.char === nextCell.char &&
      prevCell.styleId === nextCell.styleId &&
      prevCell.hyperlink === nextCell.hyperlink) {
    return  // 相同，跳过
  }
  // 移动光标到 (x, y)，写入新字符和样式
})
```

**DECSTBM 滚动优化**：当 ScrollBox 内容向下滚动时，不需要重绘整个屏幕——只需要用 `\x1b[{top};{bottom}r`（设置滚动区域）+ `\x1b[S`（向上滚动 n 行）来移动已有内容，然后只绘制新出现的行。这把滚动的渲染开销从 O(屏幕高度) 降到 O(新增行数)。

---

### 八、Optimizer：Patch 合并

```TypeScript
// src/ink/optimizer.ts
export function optimize(diff: Diff): Diff {
  // 单遍扫描，应用所有优化规则：
  // 1. 删除空 stdout patch
  // 2. 合并连续 cursorMove（(1,0)+(0,1) → (1,1)）
  // 3. 删除 (0,0) 的 cursorMove
  // 4. 合并相邻 styleStr（ANSI 样式转换序列）
  // 5. 去重连续相同超链接
  // 6. 取消 cursorHide/cursorShow 对
  // 7. 删除 count=0 的 clear
}
```

这些优化减少了写入终端的字节数，对于高频更新（流式输出、动画）效果显著。

---

### 九、同步输出（DEC 2026）：消除闪烁

```TypeScript
// src/ink/terminal.ts
export function isSynchronizedOutputSupported(): boolean {
  // 支持的终端：iTerm2, WezTerm, ghostty, kitty, VS Code, Alacritty,
  //             Windows Terminal, VTE >= 0.68, Zed...
  // 不支持：tmux（会破坏原子性）
}
```

DEC 2026（Synchronized Output）是一个终端协议扩展：

- `\x1b[?2026h`（BSU，Begin Synchronized Update）：告诉终端暂停渲染
- `\x1b[?2026l`（ESU，End Synchronized Update）：告诉终端一次性渲染所有缓冲内容

在支持的终端上，整帧的更新是原子的——用户永远看不到半渲染状态。在不支持的终端（如 tmux）上，Ink 退化为逐字节写入，可能有轻微闪烁。

---

### 十、渲染调度：16ms 节流 + 微任务延迟

```TypeScript
// src/ink/ink.tsx
const deferredRender = (): void => queueMicrotask(this.onRender)
this.scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS, {
  leading: true,
  trailing: true
})
```

两层设计：

1. **throttle（16ms）**：限制渲染频率，避免每次 React 状态更新都触发渲染
2. **queueMicrotask**：把实际渲染推迟到微任务队列，确保在 React 的 `useLayoutEffect` 执行后再渲染

为什么需要微任务延迟？`scheduleRender` 在 reconciler 的 `resetAfterCommit` 中调用，此时 React 的 layout phase（ref 附加 + `useLayoutEffect`）还没执行。如果同步渲染，`useDeclaredCursor` 设置的光标位置会滞后一帧。用微任务延迟，确保光标位置在渲染时已经是最新的。

---

### 十一、文本选择：终端里的鼠标操作

全屏模式下，Ink 实现了完整的鼠标文本选择：

```TypeScript
// src/ink/selection.ts
export type SelectionState = {
  anchor: Point | null      // 鼠标按下的位置
  focus: Point | null       // 当前拖拽位置
  isDragging: boolean
  anchorSpan: { lo, hi, kind: 'word' | 'line' } | null  // 双击/三击选择
  scrolledOffAbove: string[]  // 滚动出视口的文本（保留用于复制）
  scrolledOffBelow: string[]
}
```

选择实现的难点：

- **滚动时保持选择**：当用户拖拽到屏幕边缘触发滚动时，已滚出视口的行需要保存到 `scrolledOffAbove/Below`，否则复制时会丢失内容
- **软换行处理**：终端的自动换行不是真正的换行符，复制时需要把软换行的行合并回一行
- **双击选词/三击选行**：通过 `anchorSpan` 记录初始选择范围，拖拽时从这个范围扩展

选择覆盖层通过直接修改 Screen Buffer 的 `styleId`（反色）实现，不需要额外的渲染通道。

---

### 十二、终端兼容性矩阵

Ink 维护了一个复杂的终端能力检测系统：

| 能力 | 检测方式 | 支持的终端 |
| --- | --- | --- |
| 同步输出（DEC 2026） | `TERM_PROGRAM` + `VTE_VERSION` | iTerm2, WezTerm, ghostty, kitty... |
| 扩展键报告（Kitty 协议） | 白名单 | iTerm2, kitty, WezTerm, ghostty, tmux |
| 超链接（OSC 8） | `supports-hyperlinks` 库 | 大多数现代终端 |
| 进度条（OSC 9;4） | `TERM_PROGRAM_VERSION` | Ghostty 1.2+, iTerm2 3.6.6+, ConEmu |
| 鼠标追踪 | TTY 检测 | 支持 ANSI 鼠标的终端 |
| XTVERSION 探测 | 异步 CSI 查询 | 用于 SSH 场景下的终端识别 |

特别值得注意的是 XTVERSION 探测：`TERM_PROGRAM` 环境变量在 SSH 连接时不会转发，所以无法通过它识别远程终端。Ink 发送 `CSI > 0 q` 查询，终端通过 stdin 回复自己的名称，这个查询会穿透 SSH 到达真实的客户端终端。

---

### 十三、ScrollBox：虚拟滚动

```TypeScript
// src/ink/components/ScrollBox.tsx
export type ScrollBoxHandle = {
  scrollTo: (y: number) => void
  scrollBy: (dy: number) => void
  scrollToElement: (el: DOMElement, offset?: number) => void  // 延迟到渲染时读取位置
  scrollToBottom: () => void
  isSticky: () => boolean  // 是否固定在底部
  setClampBounds: (min, max) => void  // 虚拟滚动的范围限制
}
```

`scrollToElement` 的设计很精妙：它不立即读取元素位置（那个值可能是 Yoga 上一次计算的旧值），而是把元素引用存到 DOM 节点上，在下一帧渲染时（Yoga 重新计算后）再读取 `yogaNode.getComputedTop()`。这避免了「滚动到错误位置」的竞态条件。

**stickyScroll**：当 `stickyScroll=true` 时，内容增长会自动把滚动位置固定到底部（类似终端的自动跟随）。用户手动滚动后取消固定，再次滚到底部时重新固定。

---

### 十四、总结：Ink 的工程价值

#### 14.1 React 的力量，终端的效率

用 React 写 UI 逻辑（状态管理、组件复用、条件渲染），用自定义渲染器把它映射到终端字符网格。开发者写的是熟悉的 JSX，运行的是高效的 ANSI 序列。

#### 14.2 双缓冲 + 差分 = 无闪烁

前后帧双缓冲，Cell 级别的差分，只写变化的字符。配合 DEC 2026 同步输出，在支持的终端上实现了真正的无闪烁渲染。

#### 14.3 性能可观测

每帧都记录详细的性能指标：Yoga 布局时间、差分时间、写入时间、Yoga 节点数。这让性能问题可以被精确定位，而不是靠感觉优化。

#### 14.4 终端能力的渐进增强

从基础的 ANSI 颜色，到超链接、进度条、鼠标追踪、同步输出——每个特性都有能力检测，在不支持的终端上优雅降级。Claude Code 在 iTerm2 里是全功能体验，在基础终端里也能正常工作。

---

### 十五、给 mini-claude-code 的启示

mini-claude-code 是命令行工具，不需要实现完整的 Ink 渲染引擎，但 Ink 的几个核心思路值得借鉴：

```Python
# mini-claude-code 的极简流式输出实现
import sys

def stream_output(text_delta: str):
    """实时打印流式输出，不换行"""
    sys.stdout.write(text_delta)
    sys.stdout.flush()

def clear_line():
    """清除当前行（用于更新进度）"""
    sys.stdout.write('\r\x1b[K')
    sys.stdout.flush()

def print_tool_use(tool_name: str, input_preview: str):
    """打印工具调用信息"""
    print(f"\n\x1b[33m⚙ {tool_name}\x1b[0m: {input_preview[:80]}")

def print_tool_result(result: str, is_error: bool = False):
    """打印工具结果"""
    color = '\x1b[31m' if is_error else '\x1b[32m'
    print(f"{color}→ {result[:200]}\x1b[0m")
```

Ink 最值得 mini-claude-code 学习的设计是**帧差分思想**：不要每次都重绘整个输出，只更新变化的部分。对于流式输出，这意味着用 `\r` 回到行首更新进度，而不是每次都换行打印新行。

另一个值得借鉴的是**渐进增强**：先检测终端是否支持颜色（`TERM` 环境变量、`NO_COLOR`），再决定是否使用 ANSI 转义序列。这让工具在 CI 环境（通常不支持颜色）和交互终端（支持颜色）都能正常工作。

---

*下一篇：专题05——工具系统，深入工具注册、权限检查、并发调度、MCP 集成，以及 80+ 内置工具的分类与实现细节。*
