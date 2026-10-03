import { Settings } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { chromeIconButtonStyles, cn } from '../../../shared/styles'

export function RoomSettingsButton({ onClick, triggerClassName }: {
  onClick: () => void
  triggerClassName?: string
}) {
  const { t } = useI18n()
  return <button className={cn(chromeIconButtonStyles, triggerClassName)} type="button"
    aria-label={t('roomSettings.open')} title={t('roomSettings.open')} onClick={onClick}>
    <Settings size={18} strokeWidth={2} aria-hidden="true" />
  </button>
}
