import { z } from 'zod'

import { errorMessage } from '../errors.js'

import { decodeBase64, encodeBase64, extensionForMimeType, mimeTypeForFormat } from './base64.js'
import { GptImageApiError } from './client.js'
import type { GptImageConfig } from './config.js'
import { detectImageMimeType, type ImageIO, type ImageInputFile } from './files.js'
import { resolveImageInput } from './inputs.js'
import {
  validateImageOptions,
  type ImageBackground,
  type ImageOutputFormat,
  type ImageQuality,
  type InputFidelity,
} from './models.js'
import { requestJson, requestMultipart } from './request.js'

export interface GenerateImageOptions {
  readonly prompt: string
  readonly model: string
  readonly n: number
  readonly size: string
  readonly quality: ImageQuality
  readonly background: ImageBackground
  readonly outputFormat: ImageOutputFormat
  readonly outputCompression?: number
  readonly moderation: 'auto' | 'low'
}

export interface EditImageOptions extends GenerateImageOptions {
  readonly images: readonly string[]
  readonly mask?: string
  readonly inputFidelity?: InputFidelity
}

export interface GeneratedImage {
  readonly base64: string
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly revisedPrompt?: string
}

export interface ImageApiResult {
  readonly images: GeneratedImage[]
  readonly usage?: Record<string, unknown>
  readonly size?: string
  readonly quality?: string
  readonly outputFormat: ImageOutputFormat
}

const imageItemSchema = z.object({
  b64_json: z.string().optional(),
  url: z.string().optional(),
  revised_prompt: z.string().optional(),
})

const imagesResponseSchema = z.object({
  data: z.array(imageItemSchema),
  output_format: z.string().optional(),
  size: z.string().optional(),
  quality: z.string().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
})

type ImagesResponse = z.infer<typeof imagesResponseSchema>

export async function generateImages(
  config: GptImageConfig,
  options: GenerateImageOptions,
): Promise<ImageApiResult> {
  validateImageOptions({
    model: options.model,
    size: options.size,
    quality: options.quality,
    background: options.background,
    outputFormat: options.outputFormat,
    ...(options.outputCompression === undefined
      ? {}
      : { outputCompression: options.outputCompression }),
  })

  const body: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
    n: options.n,
    size: options.size,
    quality: options.quality,
    background: options.background,
    output_format: options.outputFormat,
    moderation: options.moderation,
  }

  if (options.outputCompression !== undefined) {
    body.output_compression = options.outputCompression
  }

  if (config.responseFormat !== undefined) {
    body.response_format = config.responseFormat
  }

  const response = await requestJson(
    config,
    '/images/generations',
    body,
    imagesResponseSchema,
    config.timeoutMs,
  )

  return await parseImagesResponse(response, options.outputFormat, config)
}

export async function editImages(
  config: GptImageConfig,
  imageIO: ImageIO | undefined,
  options: EditImageOptions,
): Promise<ImageApiResult> {
  validateImageOptions({
    model: options.model,
    size: options.size,
    quality: options.quality,
    background: options.background,
    outputFormat: options.outputFormat,
    ...(options.outputCompression === undefined
      ? {}
      : { outputCompression: options.outputCompression }),
    ...(options.inputFidelity === undefined ? {} : { inputFidelity: options.inputFidelity }),
  })

  const form = new FormData()
  form.append('model', options.model)
  form.append('prompt', options.prompt)
  form.append('n', String(options.n))
  form.append('size', options.size)
  form.append('quality', options.quality)
  form.append('background', options.background)
  form.append('output_format', options.outputFormat)
  form.append('moderation', options.moderation)

  if (options.outputCompression !== undefined) {
    form.append('output_compression', String(options.outputCompression))
  }

  if (options.inputFidelity !== undefined) {
    form.append('input_fidelity', options.inputFidelity)
  }

  if (config.responseFormat !== undefined) {
    form.append('response_format', config.responseFormat)
  }

  const files = await Promise.all(
    options.images.map(
      async (value, index) =>
        await resolveImageInput({
          value,
          config,
          imageIO,
          label: `图片 ${String(index + 1)}`,
          fallbackFilename: `image-${String(index + 1)}`,
        }),
    ),
  )

  // 单图使用 `image`，多图使用可配置字段（默认 `image[]`），与 OpenAI SDK 行为一致。
  if (files.length === 1) {
    form.append('image', toFile(files[0]), files[0].filename ?? 'image.png')
  } else {
    files.forEach((file, index) => {
      form.append(
        config.multiImageField,
        toFile(file),
        file.filename ?? `image-${String(index + 1)}.png`,
      )
    })
  }

  if (options.mask !== undefined) {
    const mask = await resolveImageInput({
      value: options.mask,
      config,
      imageIO,
      label: '遮罩图片',
      fallbackFilename: 'mask',
    })
    form.append('mask', toFile(mask), mask.filename ?? `mask${extensionForMimeType(mask.mimeType)}`)
  }

  const response = await requestMultipart(
    config,
    '/images/edits',
    form,
    imagesResponseSchema,
    config.timeoutMs,
  )

  return await parseImagesResponse(response, options.outputFormat, config)
}

async function parseImagesResponse(
  response: ImagesResponse,
  fallbackFormat: ImageOutputFormat,
  config: GptImageConfig,
): Promise<ImageApiResult> {
  if (response.data.length === 0) {
    throw new GptImageApiError('上游没有返回任何图片。', 502)
  }

  const outputFormat = normalizeOutputFormat(response.output_format, fallbackFormat)
  const mimeType = mimeTypeForFormat(outputFormat)

  const images = await Promise.all(
    response.data.map(async (item, index): Promise<GeneratedImage> => {
      if (item.b64_json !== undefined) {
        const bytes = decodeBase64(item.b64_json)

        return {
          base64: item.b64_json,
          bytes,
          mimeType: detectImageMimeType(bytes) ?? mimeType,
          ...(item.revised_prompt === undefined ? {} : { revisedPrompt: item.revised_prompt }),
        }
      }

      if (item.url !== undefined) {
        const downloaded = await downloadResultImage(item.url, config)
        return {
          base64: encodeBase64(downloaded.bytes),
          bytes: downloaded.bytes,
          mimeType: downloaded.mimeType,
          ...(item.revised_prompt === undefined ? {} : { revisedPrompt: item.revised_prompt }),
        }
      }

      throw new GptImageApiError(
        `上游返回的第 ${String(index + 1)} 张图片既没有 b64_json 也没有 url。`,
        502,
      )
    }),
  )

  return {
    images,
    outputFormat,
    ...(response.size === undefined ? {} : { size: response.size }),
    ...(response.quality === undefined ? {} : { quality: response.quality }),
    ...(response.usage === undefined ? {} : { usage: response.usage }),
  }
}

async function downloadResultImage(
  url: string,
  config: GptImageConfig,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let response: Response

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) })
  } catch (error) {
    throw new GptImageApiError(`下载上游返回的图片失败：${errorMessage(error)}`, 0)
  }

  if (!response.ok) {
    throw new GptImageApiError(
      `下载上游返回的图片失败：HTTP ${String(response.status)}。`,
      response.status,
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await response.arrayBuffer()
  } catch (error) {
    throw new GptImageApiError(`下载上游返回的图片失败：${errorMessage(error)}`, 0)
  }

  const bytes = new Uint8Array(buffer)
  const header = response.headers.get('content-type')
  const contentType = header === null ? undefined : header.split(';')[0].trim()
  const mimeType =
    contentType?.startsWith('image/') === true
      ? contentType
      : (detectImageMimeType(bytes) ?? 'image/png')

  return { bytes, mimeType }
}

function normalizeOutputFormat(
  value: string | undefined,
  fallback: ImageOutputFormat,
): ImageOutputFormat {
  return value === 'png' || value === 'jpeg' || value === 'webp' ? value : fallback
}

function toFile(file: ImageInputFile): File {
  // 复制到独立的 ArrayBuffer，确保满足 BlobPart 的非共享缓冲区要求。
  const buffer = new ArrayBuffer(file.bytes.byteLength)
  new Uint8Array(buffer).set(file.bytes)

  return new File([buffer], file.filename ?? `image${extensionForMimeType(file.mimeType)}`, {
    type: file.mimeType,
  })
}
