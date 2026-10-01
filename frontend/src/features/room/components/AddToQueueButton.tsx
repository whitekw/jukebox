import { ListPlus } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn } from '../../../shared/styles'

export function AddToQueueButton({ videoId, videoTitle, queuedVideoIds, currentVideoId, unavailable = false, loading = false, disabled = false, onClick, className }: {
  videoId: string
  videoTitle: string
  queuedVideoIds: ReadonlySet<string>
  currentVideoId: string | null
  unavailable?: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}) {
  const { t } = useI18n()
  const queued = queuedVideoIds.has(videoId)
  const current = currentVideoId === videoId
  const label = queued ? t('queue.alreadyQueued', { title: videoTitle })
    : current ? t('queue.currentSong', { title: videoTitle })
      : unavailable ? t('search.cannotAddSong', { title: videoTitle })
        : t('queue.addSong', { title: videoTitle })

  return <button type="button" onClick={onClick} disabled={disabled || loading || queued || current || unavailable}
    aria-label={label} title={unavailable && !queued && !current ? t('search.embedUnavailable') : label}
    className={cn(
      'grid size-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent p-0 transition-colors enabled:hover:bg-purple/15 focus-visible:outline-2 focus-visible:outline-purple-light',
      queued ? 'text-purple-light' : 'text-muted enabled:hover:text-purple-light disabled:opacity-45',
      className,
    )}>
    {loading ? '…' : <ListPlus size={22} strokeWidth={2} aria-hidden="true" />}
  </button>
}
