import { z } from 'zod'

import { ToolError } from '../errors.js'

import { bytesToDataUri, decodeBase64, isHttpUrl, parseBase64DataUri } from './base64.js'
import { GptImageApiError } from './client.js'
import type { GptImageConfig } from './config.js'
import { detectImageMimeType, type ImageIO } from './files.js'
import type { GeneratedImage } from './images.js'
import { validateImageOptions, type ImageBackground, type ImageQuality } from './models.js'
import { requestJson } from './request.js'

export type ResponsesAction = 'auto' | 'generate' | 'edit'

export interface ResponsesImageOptions {
  readonly prompt: string
  /** `image_generation` 工具使用的图像模型。 */
  readonly model: string
  /** Responses API 顶层的文本模型。 */
  readonly textModel: string
  readonly size: string
  readonly quality: ImageQuality
  readonly background: ImageBackground
  readonly action: ResponsesAction
  readonly images?: readonly string[]
  readonly previousResponseId?: string
}

export interface ResponsesImageResult {
  readonly images: GeneratedImage[]
  readonly responseId?: string
}

const outputItemSchema = z.object({
  type: z.string(),
  result: z.string().optional(),
  revised_prompt: z.string().optional(),
  status: z.string().optional(),
})

const responsesResponseSchema = z.object({
  id: z.string().optional(),
  output: z.array(outputItemSchema),
})

export async function generateViaResponses(
  config: GptImageConfig,
  imageIO: ImageIO | undefined,
  options: ResponsesImageOptions,
): Promise<ResponsesImageResult> {
  validateImageOptions({
    model: options.model,
    size: options.size,
    quality: options.quality,
    background: options.background,
    outputFormat: 'png',
  })

  const body: Record<string, unknown> = {
    model: options.textModel,
    input: await buildInput(options, config, imageIO),
    tools: [
      {
        type: 'image_generation',
        model: options.model,
        size: options.size,
        quality: options.quality,
        background: options.background,
        action: options.action,
      },
    ],
    tool_choice: { type: 'image_generation' },
  }

  if (options.previousResponseId !== undefined && options.previousResponseId.length > 0) {
    body.previous_response_id = options.previousResponseId
  }

  const response = await requestJson(
    config,
    '/responses',
    body,
    responsesResponseSchema,
    config.responsesTimeoutMs,
  )

  const imageCalls = response.output.filter((item) => item.type === 'image_generation_call')

  if (imageCalls.length === 0) {
    const types = response.output.map((item) => item.type).join('、')
    throw new GptImageApiError(
      `Responses 接口没有返回图片。实际 output 类型：${types.length > 0 ? types : '空'}。`,
      502,
    )
  }

  const images: GeneratedImage[] = []

  for (const call of imageCalls) {
    if (call.result === undefined || call.result.length === 0) {
      throw new GptImageApiError(`Responses 图片结果为空（status=${call.status ?? '未知'}）。`, 502)
    }

    const bytes = decodeBase64(call.result)

    images.push({
      base64: call.result,
      bytes,
      mimeType: detectImageMimeType(bytes) ?? 'image/png',
      ...(call.revised_prompt === undefined ? {} : { revisedPrompt: call.revised_prompt }),
    })
  }

  return {
    images,
    ...(response.id === undefined ? {} : { responseId: response.id }),
  }
}

async function buildInput(
  options: ResponsesImageOptions,
  config: GptImageConfig,
  imageIO: ImageIO | undefined,
): Promise<unknown> {
  const images = options.images ?? []

  if (images.length === 0) {
    return options.prompt
  }

  const content: Record<string, unknown>[] = [{ type: 'input_text', text: options.prompt }]

  for (const [index, value] of images.entries()) {
    content.push({
      type: 'input_image',
      image_url: await toInputImageUrl(value, config, imageIO, index),
    })
  }

  return [{ role: 'user', content }]
}

async function toInputImageUrl(
  value: string,
  config: GptImageConfig,
  imageIO: ImageIO | undefined,
  index: number,
): Promise<string> {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new ToolError(`图片 ${String(index + 1)} 不能为空。`)
  }

  if (trimmed.startsWith('data:')) {
    parseBase64DataUri(trimmed)
    return trimmed
  }

  if (isHttpUrl(trimmed)) {
    return trimmed
  }

  if (imageIO === undefined) {
    throw new ToolError('当前运行时不支持读取本地文件，请改用 http(s) URL 或 base64 data URI。')
  }

  const file = await imageIO.readFile(trimmed)

  return bytesToDataUri(file.mimeType, file.bytes)
}
