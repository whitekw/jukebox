type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: Record<string, string | number>
  }
}

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, string | number>

  constructor(
    status: number,
    message: string,
    code = 'API_ERROR',
    details?: Record<string, string | number>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error?.message ?? '요청을 처리하지 못했습니다.',
      body.error?.code,
      body.error?.details,
    )
  }
  return body
}
