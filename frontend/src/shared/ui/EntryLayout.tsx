import type { ReactNode } from 'react'
import { Brand } from './Brand'
import { cn } from '../styles'

export function EntryLayout({ children, className, headerActions }: { children: ReactNode; className?: string; headerActions?: ReactNode }) {
  return (
    <main className={cn('min-h-screen bg-canvas bg-[radial-gradient(ellipse_at_75%_0%,rgba(136,91,255,.07),transparent_50%)] px-5 py-6 md:px-10 md:py-8', className)}>
      <nav className="relative z-[60] mx-auto flex w-full max-w-[1120px] shrink-0 items-center justify-between gap-4">
        <Brand />
        {headerActions}
      </nav>
      {children}
    </main>
  )
}
