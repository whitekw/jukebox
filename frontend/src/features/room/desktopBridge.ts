import type { ChatMessage } from './types'

type DesktopChatNotice = {
  roomCode: string
  nickname: string
  content: string
}

declare global {
  interface Window {
    bsideDesktop?: {
      notifyChat: (message: DesktopChatNotice) => void
      onOpenChat: (callback: (roomCode: string) => void) => () => void
    }
  }
}

export function shouldNotifyDesktopChat(
  message: ChatMessage,
  currentParticipantId: string,
): message is Extract<ChatMessage, { type: 'message' }> {
  return message.type === 'message'
    && Boolean(currentParticipantId)
    && message.participantId !== currentParticipantId
}
