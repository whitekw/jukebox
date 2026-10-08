export type ChatWindowRect = {
  x: number
  y: number
  width: number
  height: number
}

export const WINDOW_MARGIN = 12
export const DEFAULT_WINDOW_WIDTH = 360
export const DEFAULT_WINDOW_HEIGHT = 480
export const MIN_WINDOW_WIDTH = 320
export const MIN_WINDOW_HEIGHT = 360

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function clampWindowRect(
  rect: ChatWindowRect,
  viewportWidth: number,
  viewportHeight: number,
  topInset = 0,
) {
  const minimumTop = Math.min(
    Math.max(WINDOW_MARGIN, topInset + WINDOW_MARGIN),
    Math.max(WINDOW_MARGIN, viewportHeight - WINDOW_MARGIN - 1),
  )
  const maxWidth = Math.max(1, viewportWidth - WINDOW_MARGIN * 2)
  const maxHeight = Math.max(1, viewportHeight - minimumTop - WINDOW_MARGIN)
  const minimumWidth = Math.min(MIN_WINDOW_WIDTH, maxWidth)
  const minimumHeight = Math.min(MIN_WINDOW_HEIGHT, maxHeight)
  const width = clamp(rect.width, minimumWidth, maxWidth)
  const height = clamp(rect.height, minimumHeight, maxHeight)

  return {
    x: clamp(rect.x, WINDOW_MARGIN, viewportWidth - WINDOW_MARGIN - width),
    y: clamp(rect.y, minimumTop, viewportHeight - WINDOW_MARGIN - height),
    width,
    height,
  }
}
