import { ToolError } from '../errors.js'

interface TextContent {
  type: 'text'
  text: string
}

interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

export type ToolContent = TextContent | ImageContent

export type ToolResult =
  | {
      content: ToolContent[]
      structuredContent: Record<string, unknown>
    }
  | {
      isError: true
      content: TextContent[]
    }

/** 成功结果：Markdown 文本 + 满足 outputSchema 的结构化数据。 */
export function ok(data: Record<string, unknown>, markdown: string): ToolResult {
  return {
    content: [{ type: 'text', text: markdown }],
    structuredContent: data,
  }
}

/** 成功结果：Markdown 文本 + MCP image content + 结构化元数据。 */
export function okImages(
  data: Record<string, unknown>,
  markdown: string,
  images: readonly { base64: string; mimeType: string }[],
): ToolResult {
  return {
    content: [
      { type: 'text', text: markdown },
      ...images.map((image) => ({
        type: 'image' as const,
        data: image.base64,
        mimeType: image.mimeType,
      })),
    ],
    structuredContent: data,
  }
}

/** 失败结果：使用 MCP 的 `isError` 通道，错误信息保持单行可读。 */
export function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)

  return {
    isError: true,
    content: [{ type: 'text', text: `❌ ${message}` }],
  }
}

/** 统一捕获工具执行期的异常，避免每个工具重复 try/catch。 */
export async function run(handler: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await handler()
  } catch (error) {
    if (!(error instanceof ToolError)) {
      console.error('[gpt-image] 工具执行失败：', error)
    }
    return fail(error)
  }
}
