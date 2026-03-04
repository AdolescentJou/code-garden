# MCP 的几种实现与连接方式（构造方案 + 客户端接入）

---

## 一、MCP 主流构造方案（按流行度排序）

### 1. FastMCP 框架（Python，最常用）

- **核心特点**：官方推荐的极简框架，基于 `mcp` 库，用装饰器快速注册工具，自动处理协议与传输。
- **两种运行模式**：
  - **stdio 模式（本地）**：默认，通过标准输入输出与客户端通信，适合本地调试、IDE 插件（如 Cursor）。
  - **streamable-http / SSE 模式（远程）**：启动 HTTP 服务，支持跨网络远程调用，生产环境首选。

**代码示例：**

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather-service", host="0.0.0.0", port=8000)


@mcp.tool()
def get_weather(city: str) -> str:
    """查询城市天气"""
    return f"{city} 天气晴"


if __name__ == "__main__":
    mcp.run(transport="streamable-http")  # 远程模式
    # mcp.run()  # 默认 stdio 本地模式
```

- **优势**：开发最快、生态成熟、适配所有主流客户端（Claude、Cursor、LangChain）。

### 2. 官方 SDK 原生实现（Python / TypeScript）

- **Python SDK**：`pip install mcp`，手动实现 Server 类、注册工具与处理请求，适合深度定制。
- **TypeScript SDK**：`npm install @modelcontextprotocol/sdk`，适合 Node.js / 前端生态，与 Claude 生态深度集成。
- **特点**：最底层、最灵活，但需手动处理 JSON-RPC、传输与生命周期。

### 3. 云厂商托管 / 集成方案

- **AWS Bedrock AgentCore**：直接在 Bedrock 中部署 MCP Server，托管运行、自动扩缩容，适合 AWS 生态。
- **Azure AI Foundry**：通过 Agent Service 注册 MCP Server，集成 Azure 安全与监控。
- **Google ADK**：原生支持 MCP，可接入 Google 多智能体框架。

**优势**：免运维、高可用、自带云安全与监控。

### 4. 自定义协议封装（不推荐）

- 基于 JSON-RPC 2.0 手动实现 MCP 协议层（`initialize` / `tools/list` / `tools/call`），再套 HTTP / SSE / WebSocket 传输。
- **适用场景**：极特殊的定制化需求，不适合常规开发。

---

## 二、客户端连接 MCP Server 的核心方案（按流行度排序）

### 1. HTTP / SSE 远程连接（`streamable-http`，最常用）

- **核心原理**：基于 HTTP 协议 + Server-Sent Events（SSE）实现双向通信，MCP Server 以 HTTP 服务形式部署（如 `http://localhost:8000`），客户端通过 URL 远程连接。
- **适用场景**：生产环境、跨机器 / 跨网络调用、多客户端共享一个 MCP Server（如团队共用工具服务）。

**典型配置示例（Claude / Cursor 客户端）：**

```json
{
  "mcpServers": {
    "weather-service": {
      "url": "http://192.168.1.100:8000",
      "timeout": 30000
    }
  }
}
```

- **优势**：部署灵活（可放服务器 / 容器）、支持多客户端接入、易监控 / 运维。

### 2. stdio 本地进程连接（本地调试首选）

- **核心原理**：MCP Server 与客户端运行在同一台机器，通过标准输入 / 输出（stdio）通信（无网络层），客户端直接启动 MCP Server 进程并与之交互。
- **适用场景**：本地调试、IDE 插件（如 Cursor 本地模式）、无需网络的离线场景。

**典型配置示例（Cursor）：**

```json
{
  "mcpServers": {
    "local-tools": {
      "command": "python",
      "args": ["/path/to/your/mcp_server.py"]
    }
  }
}
```

- **优势**：无网络依赖、调试方便、低延迟。

### 3. WebSocket 连接（小众场景）

- **核心原理**：基于 WebSocket 协议实现全双工通信，部分 MCP 框架（如自定义实现）支持该方式。
- **适用场景**：需要高频双向交互的场景（如实时协作工具）。

**配置示例：**

```json
{
  "mcpServers": {
    "realtime-tool": {
      "url": "ws://localhost:8001"
    }
  }
}
```

- **特点**：比 SSE 更灵活，但业界支持度低于 HTTP / SSE，仅部分客户端 / 框架适配。

### 4. 云厂商托管连接（企业级）

- **核心原理**：MCP Server 部署在云厂商托管服务（如 AWS Bedrock、Azure AI Foundry），客户端通过云厂商的 API / SDK 或专用端点连接。
- **适用场景**：企业级生产环境、需要高可用 / 扩缩容 / 安全认证的场景。

**示例（AWS Bedrock）：**

```python
# 客户端通过 AWS SDK 连接托管的 MCP Server
import boto3

bedrock = boto3.client("bedrock-agent")
response = bedrock.invoke_mcp_server(
    serverId="your-mcp-server-id",
    inputText="调用天气工具，查询北京天气",
)
```

- **优势**：免运维、自带鉴权 / 监控 / 容灾，适合企业级应用。