import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { io } from 'socket.io-client'
import { roomApi } from '../api'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import type { ChatMessage, RoomState } from '../types'
import { mergeChatMessages } from '../chat/mergeChatMessages'
import { shouldNotifyDesktopChat } from '../desktopBridge'
import { preferCurrentPlaybackRevision } from '../roomStateOrdering'

export function useRoomState(
  code: string,
  hostToken = '',
  participantToken = '',
  onHostRevoked?: () => void,
  onMembershipLeft?: () => void,
  authUserId = '',
  onDisconnected?: () => void,
  currentParticipantId = '',
) {
  const { t } = useI18n()
  const [room, setRoomState] = useState<RoomState | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<unknown>(null)
  const [deleted, setDeleted] = useState(false)

  const setRoom = useCallback<Dispatch<SetStateAction<RoomState | null>>>((action) => {
    setRoomState((current) => preferCurrentPlaybackRevision(
      current,
      typeof action === 'function' ? action(current) : action,
    ))
  }, [])

  const appendChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((current) => mergeChatMessages(current, [message]))
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setDeleted(false)
    setChatMessages([])
    setRoom(null)

    void roomApi
      .getRoom(code)
      .then((state) => {
        if (active) {
          setRoom(state)
          setServerTimeOffsetMs(state.serverTime - Date.now())
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [code, setRoom])

  useEffect(() => {
    if (!participantToken) return
    let active = true
    void roomApi
      .getChatMessages(code, participantToken)
      .then(({ items }) => {
        if (active) {
          setChatMessages((current) => mergeChatMessages(current, items))
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError)
      })
    return () => {
      active = false
    }
  }, [code, participantToken])

  useEffect(() => {
    setError(null)
  }, [hostToken, participantToken])

  useEffect(() => {
    let active = true
    let clockSynchronized = false
    // Vite의 개발 프록시나 일부 공유기에서는 WebSocket upgrade가 늦거나
    // 실패할 수 있다. polling으로 먼저 연결하면 실시간 통신은 유지되고,
    // 가능한 환경에서는 Socket.IO가 자동으로 WebSocket으로 승격한다.
    const socket = io({ transports: ['polling', 'websocket'] })
    const synchronizeClock = () => {
      const sentAt = Date.now()
      socket.emit('time:sync', (result: { serverTime: number }) => {
        if (!active || !Number.isFinite(result?.serverTime)) return
        const receivedAt = Date.now()
        const requestMidpoint = sentAt + (receivedAt - sentAt) / 2
        clockSynchronized = true
        setServerTimeOffsetMs(result.serverTime - requestMidpoint)
      })
    }
    socket.on('connect', () => {
      setConnected(true)
      synchronizeClock()
      socket.emit(
        'room:subscribe',
        { code, hostToken, participantToken },
        (result: {
          ok: boolean
          code?: string
          details?: Record<string, string | number>
        }) => {
          if (!result.ok && active) setError(result)
        },
      )
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('room:state', (state: RoomState) => {
      if (active && state.code === code) {
        setRoom(state)
        setError(null)
        if (!clockSynchronized) {
          setServerTimeOffsetMs(state.serverTime - Date.now())
        }
      }
    })
    socket.on('chat:message', (message: ChatMessage) => {
      if (!active || !participantToken) return
      appendChatMessage(message)
      if (shouldNotifyDesktopChat(message, currentParticipantId)) {
        window.bsideDesktop?.notifyChat({
          roomCode: code,
          nickname: message.nickname,
          content: message.content,
        })
      }
    })
    socket.on('room:deleted', (payload: { code?: string }) => {
      if (!active || payload?.code !== code) return
      setDeleted(true)
      setRoom(null)
    })
    socket.on('room:host-revoked', () => {
      if (active) onHostRevoked?.()
    })
    socket.on('room:membership-left', () => {
      if (active) onMembershipLeft?.()
    })
    socket.on('room:disconnected', () => {
      if (active) onDisconnected?.()
    })
    socket.on('connect_error', () => {
      if (active) setConnected(false)
    })

    const clockTimer = window.setInterval(() => {
      if (socket.connected) synchronizeClock()
    }, 30_000)

    return () => {
      active = false
      window.clearInterval(clockTimer)
      socket.disconnect()
    }
  }, [appendChatMessage, authUserId, code, currentParticipantId, hostToken, onHostRevoked, onMembershipLeft, onDisconnected, participantToken, setRoom])

  return {
    room,
    setRoom,
    loading,
    connected,
    serverTimeOffsetMs,
    chatMessages,
    appendChatMessage,
    deleted,
    error: error === null ? '' : getErrorMessage(error, t),
  }
}
