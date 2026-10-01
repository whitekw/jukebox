import { ListPlus } from 'lucide-react'
import { cn } from '../../../shared/styles'

export function AddToQueueButton({ label, title, loading = false, disabled = false, onClick, className }: {
  label: string
  title?: string
  loading?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}) {
  return <button type="button" onClick={onClick} disabled={disabled || loading}
    aria-label={label} title={title ?? label}
    className={cn('grid size-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent p-0 text-purple-light transition-colors hover:bg-purple/15 focus-visible:outline-2 focus-visible:outline-purple-light disabled:opacity-45', className)}>
    {loading ? '…' : <ListPlus size={22} strokeWidth={2} aria-hidden="true" />}
  </button>
}
