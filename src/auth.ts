const BEARER_PATTERN = /^Bearer\s+(.+)$/iu

/**
 * 校验入站请求的 API Key。
 *
 * 支持 `Authorization: Bearer <token>` 与 `X-API-Key`；对所有 key 执行常量时间比较，
 * 且不提前返回，降低通过响应时间推断 key 的风险。
 */
export function checkApiKeys(request: Request, apiKeys: readonly string[]): boolean {
  const token = extractToken(request)

  if (token === undefined || token.length === 0) {
    return false
  }

  const encoder = new TextEncoder()
  const candidate = encoder.encode(token)
  let matched = false

  for (const apiKey of apiKeys) {
    if (constantTimeEqual(candidate, encoder.encode(apiKey))) {
      matched = true
    }
  }

  return matched
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: 'unauthorized' },
    {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer realm="gpt-image-mcp"' },
    },
  )
}

function extractToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')

  if (authorization !== null) {
    const match = BEARER_PATTERN.exec(authorization.trim())
    if (match !== null) {
      return match[1].trim()
    }
  }

  const headerKey = request.headers.get('x-api-key')
  if (headerKey !== null) {
    return headerKey.trim()
  }

  return undefined
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length)
  let diff = left.length ^ right.length

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }

  return diff === 0
}
