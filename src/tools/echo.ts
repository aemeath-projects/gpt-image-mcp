import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { ok, run } from './register.js'

const echoInputSchema = z.object({
  text: z.string().min(1).max(10_000).describe('要回显的文本（1-10000 个字符）'),
})

const echoOutputSchema = z.object({
  text: z.string(),
  length: z.number().int().nonnegative(),
})

export function registerEchoTools(server: McpServer): void {
  server.registerTool(
    'echo',
    {
      title: '回声测试',
      description: '原样返回输入文本及其字符数，用于验证 MCP 连接与工具调用链路。',
      inputSchema: echoInputSchema,
      outputSchema: echoOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) =>
      run(async () => {
        const length = Array.from(args.text).length
        const markdown = ['# 回声', '', args.text, '', `字符数：${String(length)}`].join('\n')

        return ok({ text: args.text, length }, markdown)
      }),
  )
}
