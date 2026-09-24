import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../../shared/http'
import { roomApi } from '../api'
import type { AuthUser } from '../../auth/types'
import type { Participant } from '../types'
import {
  hostTokenKey,
  isInvalidRoomCredential,
  participantTokenKey,
} from '../roomCredentials'

export function useRoomSession(code: string, user: AuthUser | null) {
  const [hostToken, setHostToken] = useState(
    () => localStorage.getItem(hostTokenKey(code)) ?? '',
  )
  const [hostVerified, setHostVerified] = useState(false)
  const [participantToken, setParticipantToken] = useState(
    () => localStorage.getItem(participantTokenKey(code)) ?? '',
  )
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [participantLoading, setParticipantLoading] = useState(
    () => Boolean(participantToken),
  )
  const [resumeCheckedFor, setResumeCheckedFor] = useState('')
  const [participantError, setParticipantError] = useState<unknown>(null)
  const [resumeAttempt, setResumeAttempt] = useState(0)
  const [isOwner, setIsOwner] = useState(false)
  const [claimingHost, setClaimingHost] = useState(false)
  const [resumeClaimedPlayback, setResumeClaimedPlayback] = useState(false)

  const revokeHost = useCallback(() => {
    localStorage.removeItem(hostTokenKey(code))
    setHostToken('')
    setHostVerified(false)
    setResumeClaimedPlayback(false)
  }, [code])

  useEffect(() => {
    if (!participantToken) {
      return
    }
    let active = true
    setParticipantLoading(true)
    setParticipantError(null)
    void roomApi
      .getMe(code, participantToken)
      .then((me) => {
        if (active) setParticipant(me)
      })
      .catch((error: unknown) => {
        if (!active) return
        if (!isInvalidRoomCredential(error, 'participant')) {
          setParticipantError(error)
          return
        }
        localStorage.removeItem(participantTokenKey(code))
        setParticipantToken('')
        setParticipant(null)
      })
      .finally(() => {
        if (active) setParticipantLoading(false)
      })
    return () => {
      active = false
    }
  }, [code, participantToken, resumeAttempt, user?.id])

  useEffect(() => {
    if (participantToken || !user) {
      if (!participantToken) setParticipantLoading(false)
      return
    }
    const identityKey = `${code}:${user.id}`
    let active = true
    setParticipantLoading(true)
    setParticipantError(null)
    void roomApi.resumeRoom(code)
      .then((resumed) => {
        if (!active) return
        localStorage.setItem(participantTokenKey(code), resumed.participantToken)
        setParticipantToken(resumed.participantToken)
        setParticipant(resumed.participant)
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.code === 'MEMBERSHIP_NOT_FOUND') return
        setParticipantError(error)
      })
      .finally(() => {
        if (active) {
          setParticipantLoading(false)
          setResumeCheckedFor(identityKey)
        }
      })
    return () => { active = false }
  }, [code, participantToken, resumeAttempt, user])

  const retryResume = useCallback(() => {
    setParticipantLoading(true)
    setParticipantError(null)
    setResumeAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    if (!user && !hostToken && !participantToken) {
      setIsOwner(false)
      setHostVerified(false)
      return
    }
    let active = true
    void roomApi
      .getRoomSession(code, {
        ...(hostToken ? { hostToken } : {}),
        ...(participantToken ? { participantToken } : {}),
      })
      .then((session) => {
        if (!active) return
        setIsOwner(session.isOwner)
        setHostVerified(session.isHost)
        if (hostToken && !session.isHost) revokeHost()
      })
      .catch((error: unknown) => {
        if (!active) return
        setIsOwner(false)
        setHostVerified(false)
        if (hostToken && isInvalidRoomCredential(error, 'host')) revokeHost()
      })
    return () => {
      active = false
    }
  }, [code, hostToken, participantToken, revokeHost, user])

  const joinRoom = useCallback(async (nickname: string) => {
    const joined = await roomApi.joinRoom(code, nickname, participantToken)
    localStorage.setItem(participantTokenKey(code), joined.participantToken)
    setParticipantToken(joined.participantToken)
    setParticipant(joined.participant)
    return joined.room
  }, [code, participantToken])

  const claimPlaybackHost = useCallback(async () => {
    if (!isOwner || claimingHost) return null
    setClaimingHost(true)
    try {
      const claimed = await roomApi.claimRoomHost(code)
      localStorage.setItem(hostTokenKey(code), claimed.hostToken)
      setHostToken(claimed.hostToken)
      setHostVerified(true)
      setResumeClaimedPlayback(true)
      return claimed.room
    } finally {
      setClaimingHost(false)
    }
  }, [claimingHost, code, isOwner])

  return {
    hostToken,
    isHost: Boolean(hostToken && hostVerified),
    participantToken,
    participant,
    participantLoading: participantLoading || Boolean(user && !participantToken && resumeCheckedFor !== `${code}:${user.id}`),
    participantError,
    retryResume,
    isOwner,
    claimingHost,
    resumeClaimedPlayback,
    revokeHost,
    joinRoom,
    claimPlaybackHost,
  }
}
