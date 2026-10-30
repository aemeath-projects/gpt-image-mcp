import { z } from 'zod'

export const promptSchema = z
  .string()
  .min(1)
  .max(32_000)
  .describe('图像生成或编辑的提示词（1-32000 个字符）。')

export const modelSchema = z
  .string()
  .min(1)
  .max(128)
  .describe('图像模型 ID，例如 gpt-image-2.5-flare；必须以 gpt-image- 开头。')

export const nSchema = z
  .number()
  .int()
  .min(1)
  .max(10)
  .default(1)
  .describe('生成图片数量（1-10，默认 1）。')

export const sizeSchema = z
  .string()
  .regex(/^(auto|\d{1,4}x\d{1,4})$/u, 'size 必须为 auto 或 宽x高，例如 1536x1024。')
  .default('auto')
  .describe('图片尺寸：auto 或 宽x高；不同模型对尺寸的限制不同。')

export const qualitySchema = z
  .enum(['low', 'medium', 'high', 'xhigh', 'max', 'auto'])
  .default('medium')
  .describe('生成质量；xhigh 与 max 仅 gpt-image-2.5 系列支持。')

export const backgroundSchema = z
  .enum(['transparent', 'opaque', 'auto'])
  .default('auto')
  .describe('背景模式；transparent 只能配合 png 或 webp。')

export const outputFormatSchema = z
  .enum(['png', 'jpeg', 'webp'])
  .default('png')
  .describe('输出图片格式（默认 png）。')

export const outputCompressionSchema = z
  .number()
  .int()
  .min(0)
  .max(100)
  .optional()
  .describe('输出压缩率（0-100），仅 jpeg 与 webp 有效。')

export const moderationSchema = z
  .enum(['auto', 'low'])
  .default('auto')
  .describe('内容审核级别（默认 auto）。')

export const inputFidelitySchema = z
  .enum(['low', 'high'])
  .optional()
  .describe('输入保真度，仅 gpt-image-1.5 与 gpt-image-1-mini 支持。')

export const imageSourceSchema = z
  .string()
  .min(1)
  .describe('图片来源：http(s) URL、base64 data URI 或本地文件路径（本地路径仅 Node 运行时）。')

export const imagesSchema = z
  .array(imageSourceSchema)
  .min(1)
  .max(16)
  .describe('输入图片列表（1-16 张）。')

export const outputPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .optional()
  .describe('保存路径：目录或以 / 结尾时按 image_1.ext 命名，文件路径且 n>1 时按 stem-1.ext 命名。')

export const overwriteSchema = z.boolean().default(false).describe('是否允许覆盖已存在的文件。')

export const inlineSchema = z
  .boolean()
  .default(true)
  .describe('是否以 MCP image content 内联返回图片；设为 false 时必须提供 output_path。')

export const imageMetaSchema = z.object({
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  path: z.string().optional(),
  revisedPrompt: z.string().optional(),
})

export const imageOutputSchema = z.object({
  model: z.string(),
  size: z.string().optional(),
  quality: z.string().optional(),
  images: z.array(imageMetaSchema),
  saved_paths: z.array(z.string()).optional(),
  warning: z.string().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
})
