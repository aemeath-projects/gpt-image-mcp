import { errorMessage, ToolError } from '../errors.js'
import type { ServerConfig } from '../gpt-image/config.js'
import type { GeneratedImage } from '../gpt-image/images.js'
import type { ImageOutputFormat } from '../gpt-image/models.js'

export interface BuiltImageResult {
  readonly data: Record<string, unknown>
  readonly markdown: string
}

interface BuildImageResultOptions {
  readonly title: string
  readonly model: string
  readonly images: readonly GeneratedImage[]
  readonly size?: string
  readonly quality?: string
  readonly usage?: Record<string, unknown>
  readonly savedPaths?: string[]
  readonly warning?: string
  readonly extra?: Record<string, unknown>
}

/** 落盘或仅在返回中提示时复用的前置校验。 */
export function assertOutputTarget(
  inline: boolean,
  outputPath: string | undefined,
  config: ServerConfig,
): void {
  if (!inline && outputPath === undefined) {
    throw new ToolError('inline 为 false 时必须提供 output_path。')
  }

  if (outputPath !== undefined && config.imageIO === undefined) {
    throw new ToolError(
      '当前运行时不支持写入本地文件（Cloudflare Workers），请省略 output_path 或改用 Node 运行。',
    )
  }
}

export async function saveGeneratedImages(
  config: ServerConfig,
  outputPath: string,
  format: ImageOutputFormat,
  images: readonly GeneratedImage[],
  overwrite: boolean,
): Promise<string[]> {
  const imageIO = config.imageIO

  if (imageIO === undefined) {
    throw new ToolError('当前运行时不支持写入本地文件。')
  }

  return await imageIO.writeImages({
    outputPath,
    format,
    images: images.map((image, index) => ({ bytes: image.bytes, index })),
    overwrite,
  })
}

export function buildImageResult(options: BuildImageResultOptions): BuiltImageResult {
  const lines = [
    `# ${options.title}`,
    '',
    `- 模型：${options.model}`,
    `- 数量：${String(options.images.length)}`,
  ]

  if (options.size !== undefined) {
    lines.push(`- 尺寸：${options.size}`)
  }

  if (options.quality !== undefined) {
    lines.push(`- 质量：${options.quality}`)
  }

  if (options.savedPaths !== undefined && options.savedPaths.length > 0) {
    lines.push(`- 保存路径：${options.savedPaths.join('、')}`)
  }

  if (options.warning !== undefined) {
    lines.push('', `> ⚠️ ${options.warning}`)
  }

  const data: Record<string, unknown> = {
    model: options.model,
    images: options.images.map((image, index) => toImageMeta(image, options.savedPaths, index)),
    ...(options.extra ?? {}),
  }

  if (options.size !== undefined) {
    data.size = options.size
  }

  if (options.quality !== undefined) {
    data.quality = options.quality
  }

  if (options.usage !== undefined) {
    data.usage = options.usage
  }

  if (options.savedPaths !== undefined && options.savedPaths.length > 0) {
    data.saved_paths = options.savedPaths
  }

  if (options.warning !== undefined) {
    data.warning = options.warning
  }

  return { data, markdown: lines.join('\n') }
}

/** 落盘失败但在线返回仍可用时，把错误转成警告文本。 */
export function toWarning(error: unknown): string {
  return errorMessage(error)
}

function toImageMeta(
  image: GeneratedImage,
  savedPaths: string[] | undefined,
  index: number,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    mimeType: image.mimeType,
    bytes: image.bytes.length,
  }

  const path = savedPaths?.[index]
  if (path !== undefined) {
    meta.path = path
  }

  if (image.revisedPrompt !== undefined) {
    meta.revisedPrompt = image.revisedPrompt
  }

  return meta
}
