import { Activity, ArrowUpRight, DoorOpen, History, LayoutDashboard, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { AdminUser } from '../types'

const links = [
  { to: '/', label: '개요', icon: LayoutDashboard, end: true },
  { to: '/rooms', label: '방', icon: DoorOpen },
  { to: '/users', label: '사용자', icon: Users },
  { to: '/audit', label: '운영 기록', icon: History },
]

export function AdminLayout({ user }: { user: AdminUser }) {
  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="border-b border-border md:min-h-screen md:border-r md:border-b-0">
        <div className="flex h-16 items-center gap-3 px-5">
          <Activity className="size-5" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-wide">B-SIDE</div>
            <div className="text-xs text-muted-foreground">운영 대시보드</div>
          </div>
        </div>
        <Separator />
        <nav aria-label="운영 메뉴" className="flex gap-1 overflow-x-auto p-3 md:flex-col">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-4 pt-3 md:block">
          <Separator />
          <Button asChild variant="ghost" className="mt-3 w-full justify-start">
            <a href="/" target="_blank" rel="noreferrer">
              사용자 화면 <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border px-4 sm:px-7">
          <span className="text-sm text-muted-foreground">시스템 운영</span>
          <span className="truncate text-sm" title={user.discordId}>{user.displayName}</span>
        </header>
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-7 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
