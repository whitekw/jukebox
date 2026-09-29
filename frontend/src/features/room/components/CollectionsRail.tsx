import type { Ref } from 'react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn, panelStyles } from '../../../shared/styles'

export function CollectionsRail({ chatTriggerRef }: { chatTriggerRef?: Ref<HTMLDivElement> }) {
  const { t } = useI18n()

  return (
    <aside
      className={cn(
        panelStyles({ padding: 'none' }),
        'hidden min-h-0 w-[72px] flex-col items-center overflow-hidden py-3 lg:flex lg:rounded-none lg:border-y-0 lg:border-l-0 lg:bg-panel',
      )}
      aria-label={t('chat.title')}
    >
      {chatTriggerRef && (
        <div className="mt-auto flex w-full shrink-0 justify-center border-t border-line pt-3" ref={chatTriggerRef} />
      )}
    </aside>
  )
}
