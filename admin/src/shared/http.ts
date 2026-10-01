export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.method && init.method !== 'GET' ? { 'X-Bside-Admin-Action': '1' } : {}),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => ({})) as T & {
    error?: { code?: string; message?: string; details?: unknown }
  }
  if (!response.ok) {
    throw new ApiError(response.status, body.error?.code ?? 'API_ERROR',
      body.error?.message ?? '요청을 처리하지 못했습니다.', body.error?.details)
  }
  return body
}
