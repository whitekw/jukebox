import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function DataState({ loading, error, children, onRetry }: {
  loading: boolean
  error: string | null
  children: ReactNode
  onRetry: () => void
}) {
  if (loading) return <div aria-label="불러오는 중" className="space-y-3">
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-60 w-full" />
  </div>
  if (error) return <Card role="alert"><CardContent className="flex flex-wrap items-center justify-between gap-3">
    <p>{error}</p><Button variant="outline" onClick={onRetry}>다시 시도</Button>
  </CardContent></Card>
  return <>{children}</>
}

export function PageHeading({ title, description, action }: {
  title: string
  description: string
  action?: ReactNode
}) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="space-y-1"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p></div>
    {action}
  </div>
}

export function Pagination({ page, pageSize, total, onPageChange }: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
    <span>총 {total.toLocaleString('ko-KR')}건 · {page} / {lastPage} 페이지</span>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>이전</Button>
      <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>다음</Button>
    </div>
  </div>
}
