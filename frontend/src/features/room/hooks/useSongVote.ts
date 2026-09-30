import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { roomApi } from '../api'
import type { RoomState } from '../types'

export type SongVote = 'up' | 'down'

export function useSongVote({ code, songId, participantId, participantToken, setRoom }: {
  code: string
  songId: string | undefined
  participantId: string | undefined
  participantToken: string
  setRoom: Dispatch<SetStateAction<RoomState | null>>
}) {
  const { t } = useI18n()
  const [selection, setSelection] = useState<{
    code: string
    songId: string
    participantId: string
    vote: SongVote | null
    canVote: boolean
  } | null>(null)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState('')
  const generationRef = useRef(0)
  const pendingRef = useRef(false)

  useEffect(() => {
    const generation = ++generationRef.current
    pendingRef.current = false
    setVoting(false)
    setError('')
    if (!songId || !participantId) return
    void roomApi.getSongVote(code, songId, participantToken).then(({ vote, canVote }) => {
      if (generation === generationRef.current) {
        setSelection({ code, songId, participantId, vote, canVote })
      }
    }).catch((requestError) => {
      if (generation === generationRef.current) setError(getErrorMessage(requestError, t))
    })
    return () => { generationRef.current += 1 }
  }, [code, songId, participantId, participantToken, t])

  const currentSelection = songId && participantId && selection?.code === code &&
    selection.songId === songId && selection.participantId === participantId ? selection : null
  const ready = Boolean(currentSelection?.canVote)
  const isOwnRequest = currentSelection?.canVote === false
  const myVote = ready ? selection?.vote ?? null : null

  async function vote(choice: SongVote) {
    if (!ready || !songId || !participantId || pendingRef.current) return
    const generation = generationRef.current
    const nextVote = myVote === choice ? null : choice
    pendingRef.current = true
    setVoting(true)
    setError('')
    try {
      const state = await roomApi.setSongVote(code, songId, participantToken, nextVote)
      if (generation !== generationRef.current) return
      setSelection({ code, songId, participantId, vote: nextVote, canVote: true })
      setRoom((current) => current?.currentSong?.id === songId ? state : current)
    } catch (requestError) {
      if (generation === generationRef.current) setError(getErrorMessage(requestError, t))
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false
        setVoting(false)
      }
    }
  }

  return { myVote, ready, isOwnRequest, voting, error, vote }
}
