import { Check, CirclePlus } from 'lucide-react'

export function PlaylistSaveIcon({ saved }: { saved: boolean }) {
  return saved
    ? <span className="grid size-5 place-items-center rounded-full bg-lime text-canvas"><Check size={14} strokeWidth={3} aria-hidden="true" /></span>
    : <CirclePlus size={20} aria-hidden="true" />
}
