import { useEffect, useState } from 'react'
import { roomApi } from '../room/api'
import { ApiError } from '../../shared/http'
import {
  clearStoredRoomCredentials,
  getStoredRoomCredentials,
} from '../room/roomCredentials'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import type { AuthUser } from '../auth/types'
import type { RoomSession, RoomState } from '../room/types'

export function useHomeRooms(user: AuthUser | null, onRoomDeleted: () => void) {
  const { t } = useI18n()
  const [roomSessions, setRoomSessions] = useState<RoomSession[]>([])
  const [ownedRooms, setOwnedRooms] = useState<RoomState[]>([])
  const [deletingRoomCode, setDeletingRoomCode] = useState('')
  const [ownedRoomError, setOwnedRoomError] = useState('')

  useEffect(() => {
    let active = true
    function loadRoomSessions() {
      const storedRooms = getStoredRoomCredentials()
      void Promise.all(
        storedRooms.map(async ({ code, hostToken, participantToken }) => {
          try {
            return await roomApi.getRoomSession(code, { hostToken, participantToken })
          } catch (requestError) {
            if (
              requestError instanceof ApiError &&
              [401, 403, 404].includes(requestError.status)
            ) {
              clearStoredRoomCredentials(code)
            }
            return null
          }
        }),
      ).then((sessions) => {
        if (!active) return
        setRoomSessions(
          sessions
            .filter((session): session is RoomSession => session !== null)
            .sort(
              (left, right) =>
                (right.room.expiresAt ?? 0) - (left.room.expiresAt ?? 0),
            ),
        )
      })
    }

    loadRoomSessions()
    const presenceRefreshTimer = window.setTimeout(loadRoomSessions, 6_000)
    return () => {
      active = false
      window.clearTimeout(presenceRefreshTimer)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!user) {
      setOwnedRooms([])
      return () => {
        active = false
      }
    }
    void roomApi
      .getOwnedRooms()
      .then(({ items }) => {
        if (active) setOwnedRooms(items)
      })
      .catch(() => {
        if (active) setOwnedRooms([])
      })
    return () => {
      active = false
    }
  }, [user])

  async function deleteOwnedRoom(room: RoomState) {
    if (
      deletingRoomCode ||
      !window.confirm(t('home.deleteRoomConfirm', { code: room.code }))
    ) {
      return
    }
    setDeletingRoomCode(room.code)
    setOwnedRoomError('')
    try {
      await roomApi.deleteRoom(room.code)
      clearStoredRoomCredentials(room.code)
      setOwnedRooms((current) =>
        current.filter((item) => item.code !== room.code),
      )
      setRoomSessions((current) =>
        current.filter((session) => session.room.code !== room.code),
      )
      onRoomDeleted()
    } catch (requestError) {
      setOwnedRoomError(getErrorMessage(requestError, t))
    } finally {
      setDeletingRoomCode('')
    }
  }

  const recentRoomSessions = roomSessions.filter(
    (session) =>
      !ownedRooms.some((room) => room.code === session.room.code),
  )

  return {
    ownedRooms,
    recentRoomSessions,
    deletingRoomCode,
    ownedRoomError,
    deleteOwnedRoom,
  }
}
