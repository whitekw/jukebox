import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { api } from './api'
import { getErrorMessage, useI18n } from './i18n-context'
import type { RoomState } from './types'

export function useRoomState(code: string) {
  const { t } = useI18n()
  const [room, setRoom] = useState<RoomState | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    void api
      .getRoom(code)
      .then((state) => {
        if (active) setRoom(state)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError, t))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    // Vite의 개발 프록시나 일부 공유기에서는 WebSocket upgrade가 늦거나
    // 실패할 수 있다. polling으로 먼저 연결하면 실시간 통신은 유지되고,
    // 가능한 환경에서는 Socket.IO가 자동으로 WebSocket으로 승격한다.
    const socket = io({ transports: ['polling', 'websocket'] })
    socket.on('connect', () => {
      setConnected(true)
      socket.emit(
        'room:subscribe',
        { code },
        (result: {
          ok: boolean
          code?: string
          details?: Record<string, string | number>
        }) => {
          if (!result.ok && active) setError(getErrorMessage(result, t))
        },
      )
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('room:state', (state: RoomState) => {
      if (active && state.code === code) {
        setRoom(state)
        setError('')
      }
    })
    socket.on('connect_error', () => {
      if (active) setConnected(false)
    })

    return () => {
      active = false
      socket.disconnect()
    }
  }, [code, t])

  return { room, setRoom, loading, connected, error }
}
