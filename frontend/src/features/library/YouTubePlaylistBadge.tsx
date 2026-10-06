import { RefreshCw } from 'lucide-react'
import { useI18n } from '../../shared/i18n/i18n-context'

export function YouTubePlaylistBadge() {
  const { t } = useI18n()
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium text-purple-light" title={t('library.youtubeReadOnly')}>
      <RefreshCw size={11} aria-hidden="true" />{t('library.youtubeSynced')}
    </span>
  )
}
