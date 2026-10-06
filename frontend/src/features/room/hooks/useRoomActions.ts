import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { roomApi, type ControlCredentials } from '../api'
import { ApiError } from '../../../shared/http'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import type { ChatMessage, RoomState } from '../types'

type RoomAction = () => Promise<RoomState>

export function useRoomActions({
  code,
  room,
  setRoom,
  hostToken,
  participantToken,
  controlCredentials,
  appendChatMessage,
  claimPlaybackHostSession,
}: {
  code: string
  room: RoomState | null
  setRoom: Dispatch<SetStateAction<RoomState | null>>
  hostToken: string
  participantToken: string
  controlCredentials: ControlCredentials | null
  appendChatMessage: (message: ChatMessage) => void
  claimPlaybackHostSession: () => Promise<RoomState | null>
}) {
  const { t } = useI18n()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function runRoomAction(action: RoomAction) {
    setRoom(await action())
  }

  async function runControllerAction(action: RoomAction) {
    if (!controlCredentials) {
      throw new ApiError(403, '', 'CONTROL_FORBIDDEN')
    }
    await runRoomAction(action)
  }

  async function runQueueAction(action: RoomAction) {
    setError('')
    try {
      await runRoomAction(action)
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
  }

  async function addSong(videoId: string) {
    if (!participantToken) return
    const startsPlayingImmediately = !room?.currentSong
    setError('')
    setMessage('')
    try {
      setRoom(await roomApi.addSong(code, participantToken, videoId))
      setMessage(
        startsPlayingImmediately
          ? t('room.firstSongPlaying')
          : t('room.addedToQueue'),
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
  }

  async function sendChatMessage(content: string) {
    if (!participantToken) return
    const chatMessage = await roomApi.sendChatMessage(
      code,
      participantToken,
      content,
    )
    appendChatMessage(chatMessage)
  }

  function reportPlaybackBlocked(blocked: boolean) {
    if (!hostToken) return
    void runControllerAction(() =>
      roomApi.reportPlaybackBlocked(code, hostToken, blocked),
    ).catch((requestError) => setError(getErrorMessage(requestError, t)))
  }

  function reportPlaybackStarted(videoId: string, positionSeconds: number) {
    const playbackCredentials = participantToken
      ? { participantToken }
      : hostToken || null
    if (!playbackCredentials || room?.playbackMode !== 'all_devices') return
    void runRoomAction(() =>
      roomApi.startPlayback(
        code,
        playbackCredentials,
        videoId,
        positionSeconds,
      ),
    ).catch((requestError) => setError(getErrorMessage(requestError, t)))
  }

  async function claimPlaybackHost() {
    setError('')
    try {
      const claimedRoom = await claimPlaybackHostSession()
      if (claimedRoom) setRoom(claimedRoom)
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
  }

  function reportPlaybackFailed(songId: string, videoId: string, errorCode: number) {
    const playbackCredentials = room?.playbackMode === 'host_only'
      ? hostToken
      : { participantToken: participantToken || undefined }
    if (!playbackCredentials) return
    void runRoomAction(() =>
      roomApi.reportPlaybackFailure(code, playbackCredentials, songId, videoId, errorCode),
    ).catch((requestError) => setError(getErrorMessage(requestError, t)))
  }

  return {
    message,
    error,
    setError,
    addSong,
    sendChatMessage,
    runControllerAction,
    runQueueAction,
    reportPlaybackBlocked,
    reportPlaybackStarted,
    reportPlaybackFailed,
    claimPlaybackHost,
  }
}
