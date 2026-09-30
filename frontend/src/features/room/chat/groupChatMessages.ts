import type { ChatMessage } from '../types'

type UserMessage = Extract<ChatMessage, { type: 'message' }>
type MessageGroup = { type: 'group'; id: string; messages: UserMessage[] }
type ChatGroup = MessageGroup | Extract<ChatMessage, { type: 'system' }>

const GROUP_INTERVAL_MS = 5 * 60 * 1000

export function groupChatMessages(messages: ChatMessage[]): ChatGroup[] {
  const groups: ChatGroup[] = []
  for (const message of messages) {
    if (message.type === 'system') {
      groups.push(message)
      continue
    }
    const group = groups.at(-1)
    const previous = group?.type === 'group' ? group.messages.at(-1) : undefined
    if (group?.type === 'group' && previous &&
      previous.participantId === message.participantId &&
      previous.nickname === message.nickname &&
      message.createdAt >= previous.createdAt &&
      message.createdAt - previous.createdAt < GROUP_INTERVAL_MS &&
      new Date(message.createdAt).toDateString() === new Date(previous.createdAt).toDateString()) {
      group.messages.push(message)
    } else {
      groups.push({ type: 'group', id: message.id, messages: [message] })
    }
  }
  return groups
}
