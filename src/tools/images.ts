import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import type { ServerConfig } from '../gpt-image/config.js'
import { editImages, generateImages } from '../gpt-image/images.js'

import { assertOutputTarget, buildImageResult, saveGeneratedImages, toWarning } from './output.js'
import { ok, okImages, run } from './register.js'
import {
  backgroundSchema,
  imageOutputSchema,
  imageSourceSchema,
  imagesSchema,
  inlineSchema,
  inputFidelitySchema,
  modelSchema,
  moderationSchema,
  nSchema,
  outputCompressionSchema,
  outputFormatSchema,
  outputPathSchema,
  overwriteSchema,
  promptSchema,
  qualitySchema,
  sizeSchema,
} from './schemas.js'

const generateInputSchema = z.object({
  prompt: promptSchema,
  model: modelSchema.optional(),
  n: nSchema,
  size: sizeSchema,
  quality: qualitySchema,
  background: backgroundSchema,
  output_format: outputFormatSchema,
  output_compression: outputCompressionSchema,
  moderation: moderationSchema,
  output_path: outputPathSchema,
  overwrite: overwriteSchema,
  inline: inlineSchema,
})

const editInputSchema = generateInputSchema.extend({
  images: imagesSchema,
  mask: imageSourceSchema.optional(),
  input_fidelity: inputFidelitySchema,
})

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const

export function registerImageTools(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'generate_image',
    {
      title: '生成图片',
      description:
        '通过 OpenAI Images API（/v1/images/generations）生成图片，支持 gpt-image-2 与 gpt-image-2.5 系列模型。',
      inputSchema: generateInputSchema,
      outputSchema: imageOutputSchema,
      annotations,
    },
    async (args) =>
      run(async () => {
        const model = args.model ?? config.gptImage.defaultModel
        assertOutputTarget(args.inline, args.output_path, config)

        const result = await generateImages(config.gptImage, {
          prompt: args.prompt,
          model,
          n: args.n,
          size: args.size,
          quality: args.quality,
          background: args.background,
          outputFormat: args.output_format,
          outputCompression: args.output_compression,
          moderation: args.moderation,
        })

        let savedPaths: string[] | undefined
        let warning: string | undefined

        if (args.output_path !== undefined) {
          try {
            savedPaths = await saveGeneratedImages(
              config,
              args.output_path,
              args.output_format,
              result.images,
              args.overwrite,
            )
          } catch (error) {
            if (!args.inline) {
              throw error
            }
            warning = toWarning(error)
          }
        }

        const built = buildImageResult({
          title: '图片已生成',
          model,
          images: result.images,
          size: result.size,
          quality: result.quality,
          usage: result.usage,
          savedPaths,
          warning,
        })

        return args.inline
          ? okImages(built.data, built.markdown, result.images)
          : ok(built.data, built.markdown)
      }),
  )

  server.registerTool(
    'edit_image',
    {
      title: '编辑图片',
      description:
        '通过 OpenAI Images API（/v1/images/edits）编辑图片，支持单图、多图、mask 与 gpt-image-2 / 2.5 系列模型。',
      inputSchema: editInputSchema,
      outputSchema: imageOutputSchema,
      annotations,
    },
    async (args) =>
      run(async () => {
        const model = args.model ?? config.gptImage.editModel
        assertOutputTarget(args.inline, args.output_path, config)

        const result = await editImages(config.gptImage, config.imageIO, {
          prompt: args.prompt,
          model,
          n: args.n,
          size: args.size,
          quality: args.quality,
          background: args.background,
          outputFormat: args.output_format,
          outputCompression: args.output_compression,
          moderation: args.moderation,
          images: args.images,
          mask: args.mask,
          inputFidelity: args.input_fidelity,
        })

        let savedPaths: string[] | undefined
        let warning: string | undefined

        if (args.output_path !== undefined) {
          try {
            savedPaths = await saveGeneratedImages(
              config,
              args.output_path,
              args.output_format,
              result.images,
              args.overwrite,
            )
          } catch (error) {
            if (!args.inline) {
              throw error
            }
            warning = toWarning(error)
          }
        }

        const built = buildImageResult({
          title: '图片已编辑',
          model,
          images: result.images,
          size: result.size,
          quality: result.quality,
          usage: result.usage,
          savedPaths,
          warning,
        })

        return args.inline
          ? okImages(built.data, built.markdown, result.images)
          : ok(built.data, built.markdown)
      }),
  )
}
