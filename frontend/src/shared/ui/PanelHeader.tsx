import type { ReactNode, Ref } from 'react'
import { X } from 'lucide-react'
import { cn, panelCloseButtonStyles } from '../styles'

type PanelHeaderProps = {
  titleId: string
  title: string
  subtitle: ReactNode
  icon: ReactNode
  iconClassName?: string
  actions?: ReactNode
  closeLabel: string
  onClose: () => void
  closeButtonRef?: Ref<HTMLButtonElement>
}

export function PanelHeader({ titleId, title, subtitle, icon, iconClassName, actions, closeLabel, onClose, closeButtonRef }: PanelHeaderProps) {
  return <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn('grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-purple/25 bg-purple/10 text-purple-light', iconClassName)}>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 id={titleId} className="m-0 truncate text-lg font-bold" title={title}>{title}</h2>
        <p className="m-0 truncate text-xs text-muted">{subtitle}</p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {actions}
      <button ref={closeButtonRef} className={panelCloseButtonStyles} type="button" aria-label={closeLabel} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  </header>
}
