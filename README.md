# gpt-image-mcp

GPT Image 图像生成与编辑的 MCP Server，为 LLM 客户端提供标准化的工具调用能力。

![NPM Version](https://img.shields.io/npm/v/%40aemeath-projects%2Fgpt-image-mcp?style=for-the-badge)
![CI Status](https://img.shields.io/github/actions/workflow/status/aemeath-projects/gpt-image-mcp/publish.yml?style=for-the-badge)
![License](https://img.shields.io/github/license/aemeath-projects/gpt-image-mcp?style=for-the-badge)

## 特性

- **三种运行方式**：stdio、Streamable HTTP、Cloudflare Workers，共用同一套工具代码。
- **双输出**：每次调用同时返回 Markdown 文本与满足 `outputSchema` 的 `structuredContent`。
- **统一结果约定**：成功走 `content` + `structuredContent`，失败走 `isError` 通道。
- **可扩展骨架**：`src/gpt-image/` 预留领域目录，新增工具只需实现 `registerXxxTools`。
- **零配置启动**：无需 API Key，`npx` 即可运行。

## 目录

- [快速开始](#快速开始)
- [工具](#工具)
- [运行方式](#运行方式)
- [配置](#配置)
- [数据来源](#数据来源)
- [开发](#开发)

## 快速开始

直接运行（stdio，默认传输方式）：

```bash
npx -y -p @aemeath-projects/gpt-image-mcp gpt-image-mcp
```

在 Claude Code 中注册：

```bash
claude mcp add gpt-image -- npx -y -p @aemeath-projects/gpt-image-mcp gpt-image-mcp
```

Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "gpt-image": {
      "command": "npx",
      "args": ["-y", "-p", "@aemeath-projects/gpt-image-mcp", "gpt-image-mcp"]
    }
  }
}
```

> Windows 下若客户端找不到 `npx`，可将 `command` 改为 `cmd`，并在 `args` 开头加入 `/c`。

## 工具

所有工具都声明 `annotations`。成功时返回 Markdown 文本与 `structuredContent`；
失败时返回 `isError: true` 与单行错误信息。

| 工具   | 用途                             | 关键参数 | 注解                                                   |
| ------ | -------------------------------- | -------- | ------------------------------------------------------ |
| `echo` | 回显输入文本及其字符数，验证链路 | `text`   | `readOnlyHint`、`idempotentHint`、非破坏性、非开放世界 |

当前仓库处于脚手架阶段，仅提供 `echo` 示例工具。gpt-image 领域工具将在后续版本加入。

## 运行方式

### stdio

```bash
npx -y -p @aemeath-projects/gpt-image-mcp gpt-image-mcp
```

从源码运行：

```bash
pnpm build
pnpm start          # 等价于 node dist/cli.js
```

### Streamable HTTP

```bash
pnpm start:http     # 等价于 node dist/cli.js --transport http
```

默认监听 `http://127.0.0.1:3000/mcp`。健康检查固定为 `GET /health`，不受 `--path` 影响。

```bash
# 健康检查
curl -s http://127.0.0.1:3000/health

# 列出工具
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 调用 echo
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"hello"}}}'
```

响应为 SSE，`result.structuredContent` 是结构化数据，`result.content` 是对应的 Markdown：

```text
event: message
data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"# 回声\n\nhello\n\n字符数：5"}],"structuredContent":{"text":"hello","length":5}}}
```

Node 侧默认绑定 `127.0.0.1`，并启用 localhost 级别的 Host/Origin 校验。监听 `0.0.0.0`
或经反向代理暴露时，必须显式配置 `MCP_ALLOWED_HOSTS` 与 `MCP_ALLOWED_ORIGINS`。

### Cloudflare Workers

```bash
pnpm worker:dev      # http://127.0.0.1:8787/mcp
pnpm worker:check    # 仅打包校验，不部署
pnpm worker:deploy   # 手动部署，仅用于调试
```

日常发布使用 Cloudflare Workers Builds：在 Dashboard 连接 Git 仓库，生产分支设为
`master`，Root directory 为 `/`，Build command 为 `pnpm run build`，Deploy command 为
`npx wrangler deploy`，构建环境变量只需 `NODE_VERSION=26`。运行时变量
`ALLOWED_HOSTS`、`ALLOWED_ORIGINS` 在 Worker 的 Variables 中配置。Worker 端 MCP 端点
固定为 `/mcp`，健康检查为 `/health`。

## 配置

CLI 参数优先级高于环境变量。`MCP_ALLOWED_ORIGINS` 与 `MCP_ALLOWED_HOSTS` 未显式配置时，
绑定 localhost 会自动使用 SDK 的 localhost 白名单。

| CLI 参数                    | 环境变量              | 默认值      | 说明                           |
| --------------------------- | --------------------- | ----------- | ------------------------------ |
| `--transport <stdio\|http>` | `MCP_TRANSPORT`       | `stdio`     | 传输方式                       |
| `--host <host>`             | `MCP_HOST`            | `127.0.0.1` | HTTP 监听地址                  |
| `--port <port>`             | `MCP_PORT`            | `3000`      | HTTP 监听端口                  |
| `--path <path>`             | `MCP_PATH`            | `/mcp`      | MCP 端点路径                   |
| —                           | `MCP_ALLOWED_HOSTS`   | 未设置      | 允许的 Host 主机名，逗号分隔   |
| —                           | `MCP_ALLOWED_ORIGINS` | 未设置      | 允许的 Origin 主机名，逗号分隔 |
| `--help` / `-h`             | —                     | —           | 显示帮助                       |
| `--version` / `-v`          | —                     | —           | 显示版本                       |

Worker 运行时使用 `ALLOWED_HOSTS`、`ALLOWED_ORIGINS`（逗号分隔），空值表示不启用对应校验。

## 数据来源

- 当前版本不访问外部数据源，`echo` 仅回显输入内容。
- 接入 gpt-image 接口后，将在此补充 API 地址、鉴权方式与数据处理说明。

## 开发

环境要求：Node.js `>= 24.22.1`，pnpm `12.15.0`（由 `packageManager` 固定）。

```bash
pnpm install
pnpm build
```

构建产物输出到 `dist/`：

- `dist/index.js`：公共库入口
- `dist/http.js`：web-standard HTTP handler
- `dist/cli.js`：命令行入口（含 shebang）
- `dist/chunk-*.js`：代码分割产生的共享 chunk

常用脚本：

| 脚本                | 说明                           |
| ------------------- | ------------------------------ |
| `pnpm dev`          | tsup watch 构建                |
| `pnpm lint`         | ESLint 检查                    |
| `pnpm lint:fix`     | ESLint 自动修复                |
| `pnpm format`       | Prettier 检查                  |
| `pnpm format:fix`   | Prettier 格式化                |
| `pnpm type-check`   | TypeScript 类型检查            |
| `pnpm inspect`      | MCP Inspector 调试（需先构建） |
| `pnpm worker:dev`   | 本地 Worker 开发               |
| `pnpm worker:check` | Worker 打包校验                |
| `pnpm bump`         | 版本号、CHANGELOG、tag 与提交  |
| `pnpm commit`       | Commitizen 交互式提交          |

完整脚本（含 `bump:patch` / `bump:minor` / `bump:major`、`changelog`、`start:http` 等）
见 `package.json`。

目录结构：

```text
src/
├── cli.ts       # bin 入口，stdio/http 分流
├── config.ts    # CLI 与环境变量解析
├── env.ts       # 列表环境变量解析（Worker 可用）
├── errors.ts    # ToolError 业务错误基类
├── http.ts      # 共享 web-standard fetch handler
├── index.ts     # 公共库 barrel
├── node.ts      # node:http + toNodeHandler
├── server.ts    # McpServer 工厂与工具注册
├── version.ts   # 服务名与版本号
├── worker.ts    # Cloudflare Worker 入口
├── gpt-image/   # 领域目录（待实现）
│   └── client.ts    # 接口错误类与后续请求封装
└── tools/       # 工具域
    ├── echo.ts      # 示例工具
    └── register.ts  # 统一的成功/失败结果封装
```

新增工具时，按 `src/tools/echo.ts` 的模式实现 `registerXxxTools(server)`，在
`src/server.ts` 中注册，并在 `src/gpt-image/` 中补充数据访问代码。

`http.ts`、`server.ts`、`worker.ts`、`env.ts`、`version.ts`、`tools/**`、`gpt-image/**`
保持 Node-free，由 ESLint `no-restricted-imports` 约束；Node 适配器 `node.ts` 仅在 HTTP
模式下动态加载。
