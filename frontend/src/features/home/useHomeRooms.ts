import { useEffect, useState } from 'react'
import { roomApi } from '../room/api'
import { clearStoredRoomCredentials } from '../room/roomCredentials'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import type { AuthUser } from '../auth/types'
import type { RoomState } from '../room/types'

export function useHomeRooms(user: AuthUser | null) {
  const { t } = useI18n()
  const [ownedRooms, setOwnedRooms] = useState<RoomState[]>([])
  const [joinedRooms, setJoinedRooms] = useState<RoomState[]>([])
  const [busyRoomCode, setBusyRoomCode] = useState('')
  const [roomError, setRoomError] = useState('')

  useEffect(() => {
    let active = true
    if (!user) {
      setOwnedRooms([])
      setJoinedRooms([])
      return () => { active = false }
    }
    void Promise.all([roomApi.getOwnedRooms(), roomApi.getJoinedRooms()])
      .then(([owned, joined]) => {
        if (!active) return
        setOwnedRooms(owned.items)
        setJoinedRooms(joined.items)
      })
      .catch((error: unknown) => {
        if (active) setRoomError(getErrorMessage(error, t))
      })
    return () => { active = false }
  }, [user, t])

  async function leaveJoinedRoom(room: RoomState) {
    if (busyRoomCode || !window.confirm(t('home.leaveRoomConfirm', { code: room.code }))) return
    setBusyRoomCode(room.code)
    setRoomError('')
    try {
      await roomApi.leaveRoom(room.code)
      clearStoredRoomCredentials(room.code)
      setJoinedRooms((current) => current.filter((item) => item.code !== room.code))
    } catch (error) {
      setRoomError(getErrorMessage(error, t))
    } finally {
      setBusyRoomCode('')
    }
  }

  return {
    ownedRooms,
    joinedRooms,
    busyRoomCode,
    roomError,
    leaveJoinedRoom,
  }
}
