import type { ChatMessage } from '../types'

const CHAT_HISTORY_LIMIT = 100

export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  const all = [...byId.values()].sort((left, right) => left.sequence - right.sequence)
  const messages = all.filter((entry) => entry.type === 'message').slice(-CHAT_HISTORY_LIMIT)
  const logs = all.filter((entry) => entry.type === 'system').slice(-CHAT_HISTORY_LIMIT)
  return [...messages, ...logs].sort((left, right) => left.sequence - right.sequence)
}
