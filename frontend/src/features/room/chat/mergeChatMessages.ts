import type { ChatMessage } from '../types'

const CHAT_HISTORY_LIMIT = 100

export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()]
    .sort(
      (left, right) =>
        left.createdAt - right.createdAt || left.sequence - right.sequence,
    )
    .slice(-CHAT_HISTORY_LIMIT)
}
