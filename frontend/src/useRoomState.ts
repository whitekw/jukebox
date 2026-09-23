import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { api } from './api'
import { getErrorMessage, useI18n } from './i18n-context'
import type { ChatMessage, RoomState } from './types'

const CHAT_HISTORY_LIMIT = 100

function mergeChatMessages(
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

export function useRoomState(
  code: string,
  hostToken = '',
  participantToken = '',
) {
  const { t } = useI18n()
  const [room, setRoom] = useState<RoomState | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<unknown>(null)
  const loadedCodeRef = useRef('')

  const appendChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((current) => mergeChatMessages(current, [message]))
  }, [])

  useEffect(() => {
    let active = true
    let clockSynchronized = false
    if (loadedCodeRef.current !== code) setLoading(true)
    setError(null)
    setChatMessages([])

    void api
      .getRoom(code)
      .then((state) => {
        if (active) {
          setRoom(state)
          loadedCodeRef.current = code
          setServerTimeOffsetMs(state.serverTime - Date.now())
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    if (participantToken) {
      void api
        .getChatMessages(code, participantToken)
        .then(({ items }) => {
          if (active) {
            setChatMessages((current) => mergeChatMessages(current, items))
          }
        })
        .catch((requestError: unknown) => {
          if (active) setError(requestError)
        })
    }

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
      if (active && participantToken) appendChatMessage(message)
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
  }, [appendChatMessage, code, hostToken, participantToken])

  return {
    room,
    setRoom,
    loading,
    connected,
    serverTimeOffsetMs,
    chatMessages,
    appendChatMessage,
    error: error === null ? '' : getErrorMessage(error, t),
  }
}
