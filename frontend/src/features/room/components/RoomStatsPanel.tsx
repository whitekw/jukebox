import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { History, RotateCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { PanelHeader } from '../../../shared/ui/PanelHeader'
import { roomApi } from '../api'
import type { RoomStats } from '../types'
import { RoomPlaybackHistory } from './RoomPlaybackHistory'

type Period = 'hourly' | 'daily' | 'weekly' | 'monthly'
const periods = ['hourly', 'daily', 'weekly', 'monthly'] as const

function periodLabel(key: string, period: Period, locale: string, timeZone: string, short = false) {
  const date = new Date(period === 'hourly' ? key : `${period === 'monthly' ? `${key}-01` : key}T00:00:00Z`)
  return new Intl.DateTimeFormat(locale, {
    timeZone: period === 'hourly' ? timeZone : 'UTC',
    ...(short ? {} : { year: 'numeric' }),
    ...(period === 'hourly' && short ? {} : { month: short ? 'numeric' : 'short' }),
    ...(period === 'monthly' ? {} : { day: 'numeric' }),
    ...(period === 'hourly' ? { hour: '2-digit', hourCycle: 'h23' as const } : {}),
  }).format(date)
}

export default function RoomStatsPanel({ code, participantToken, revision, historyRevision, onClose, onAddSong, queuedVideoIds, currentVideoId, onLibraryChange, libraryRevision, message, roomError }: {
  code: string
  participantToken: string
  revision: string
  historyRevision: string
  onClose: () => void
  onAddSong: (videoId: string) => Promise<void>
  queuedVideoIds: ReadonlySet<string>
  currentVideoId: string | null
  onLibraryChange: () => void
  libraryRevision: number
  message: string
  roomError: string
}) {
  const { locale, t } = useI18n()
  const [stats, setStats] = useState<RoomStats | null>(null)
  const [period, setPeriod] = useState<Period>('daily')
  const [tab, setTab] = useState<'stats' | 'history'>('stats')
  const [participantPeriod, setParticipantPeriod] = useState<Period>('daily')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog:modal')) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (panel?.contains(document.activeElement)) trigger?.focus({ preventScroll: true })
    }
  }, [onClose])

  useEffect(() => {
    if (tab !== 'stats') return
    let active = true
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    void roomApi.getRoomStats(code, participantToken, timeZone).then((result) => {
      if (!active) return
      setStats(result)
      setError('')
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause, t))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [code, participantToken, revision, retry, t, tab])

  const points = stats?.[period] ?? []
  const periodRange = t(`stats.${period}Range`)
  const participantPoints = stats?.[participantPeriod].map(({ key }, index) => ({
    key,
    ...Object.fromEntries(stats.participants.map((person, personIndex) =>
      [`participant_${personIndex}`, person[participantPeriod][index]?.count ?? 0])),
  })) ?? []
  const participantPeriodRange = t(`stats.${participantPeriod}Range`)
  const participantMaxCount = Math.max(1, ...stats?.participants.flatMap((person) =>
    person[participantPeriod].map(({ count }) => count)) ?? [0])
  const participantTickStep = Math.max(1, Math.ceil(participantMaxCount / 4))
  const participantTicks = Array.from({ length: Math.ceil(participantMaxCount / participantTickStep) + 1 },
    (_, index) => index * participantTickStep)
  const colorIndexById = new Map([...stats?.participants ?? []]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((person, index) => [person.id, index]))
  const participantColor = (id: string) =>
    `hsl(${Math.round((260 + (colorIndexById.get(id) ?? 0) * 137.508) % 360)} 85% 72%)`

  return <section ref={panelRef} aria-labelledby={titleId}
    className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-canvas text-ink">
    <PanelHeader titleId={titleId} title={t('stats.title')} subtitle={t('stats.subtitle')}
      icon={<History size={20} aria-hidden="true" />} closeLabel={t('stats.close')}
      onClose={onClose} closeButtonRef={closeRef} />

    <div className="flex shrink-0 gap-1 border-b border-line px-4 sm:px-6" role="group" aria-label={t('stats.title')}>
      {(['stats', 'history'] as const).map((option) => <button key={option} type="button"
        aria-pressed={tab === option} onClick={() => setTab(option)}
        className={`border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple-light ${tab === option
          ? 'border-purple-light text-purple-light' : 'border-transparent text-muted hover:text-ink'}`}>
        {t(option === 'stats' ? 'stats.tab' : 'history.title')}
      </button>)}
    </div>

    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 ${tab === 'history'
      ? '[scrollbar-width:thin] [scrollbar-color:var(--color-dim)_transparent]'
      : '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}`}>
      {tab === 'history' ? <RoomPlaybackHistory code={code} participantToken={participantToken} revision={historyRevision}
        onAddSong={onAddSong} queuedVideoIds={queuedVideoIds} currentVideoId={currentVideoId}
        onLibraryChange={onLibraryChange} libraryRevision={libraryRevision}
        message={message} roomError={roomError} />
        : error && !stats ? <div role="alert" className="flex items-center gap-3 text-sm text-danger">
        <span>{error}</span>
        <button type="button" className="rounded-lg p-2 text-purple-light hover:bg-white/10"
          aria-label={t('common.retry')} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>
          <RotateCw size={17} />
        </button>
      </div> : loading && !stats ? <p className="text-sm text-muted" role="status">{t('library.loading')}</p> : stats && <>
        {error && <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-danger/25 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button type="button" className="ml-auto shrink-0 rounded-md p-1 text-purple-light hover:bg-white/10"
            aria-label={t('common.retry')} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>
            <RotateCw size={16} />
          </button>
        </div>}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {([
            [t('stats.totalPlays'), stats.totalPlays, 'text-purple-light'],
            [t('stats.totalUpvotes'), stats.totalUpvotes, 'text-lime'],
            [t('stats.totalDownvotes'), stats.totalDownvotes, 'text-danger'],
          ] as const).map(([label, count, color]) => <div key={label}
            className="flex min-h-24 flex-col justify-between rounded-xl border border-line bg-panel p-3 sm:p-4">
            <span className="text-[11px] font-semibold leading-4 text-muted sm:text-xs">{label}</span>
            <strong className={`text-2xl font-bold tabular-nums sm:text-3xl ${color}`}>{numberFormatter.format(count)}</strong>
          </div>)}
        </div>

        <section className="mt-6 rounded-xl border border-line bg-panel p-4 sm:p-5" aria-label={t('stats.playbackTrend')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="m-0 text-sm font-bold">{t('stats.playbackTrend')}</h3>
              <p className="m-0 mt-1 text-xs text-muted">{periodRange} · {stats.timeZone}</p>
            </div>
            <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label={t('stats.playbackTrend')}>
              {periods.map((option) => <button key={option} type="button"
                aria-pressed={period === option} onClick={() => setPeriod(option)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple-light ${period === option
                  ? 'bg-purple/25 text-purple-light' : 'text-muted hover:text-ink'}`}>
                {t(`stats.${option}`)}
              </button>)}
            </div>
          </div>
          {stats.totalPlays === 0 ? <p className="grid h-52 place-items-center text-sm text-muted">{t('stats.empty')}</p> : <>
            <BarChart data={points} responsive style={{ width: '100%', height: 224 }}
              margin={{ top: 24, right: 8, bottom: 0, left: -14 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.08)" />
              <XAxis dataKey="key" tickLine={false} axisLine={false} minTickGap={12}
                tick={{ fill: '#a7a2b4', fontSize: 10 }}
                tickFormatter={(key: string) => periodLabel(key, period, locale, stats.timeZone, true)} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36}
                tick={{ fill: '#a7a2b4', fontSize: 10 }} />
              <Tooltip labelFormatter={(label) => periodLabel(String(label), period, locale, stats.timeZone)}
                formatter={(value) => [numberFormatter.format(Number(value)), t('stats.playCount')]}
                contentStyle={{ background: '#1b1723', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, color: '#f6f4ff' }}
                cursor={{ fill: 'rgba(194,175,255,.08)' }} />
              <Bar dataKey="count" fill="var(--color-purple-light)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
            <ul className="sr-only" aria-label={t('stats.playbackTrend')}>
              {points.map(({ key, count }) => <li key={key}>{periodLabel(key, period, locale, stats.timeZone)}: {numberFormatter.format(count)}</li>)}
            </ul>
          </>}
          {stats.hasEstimatedHistory && <p className="m-0 mt-3 text-xs text-muted">{t('stats.historicalEstimate')}</p>}
        </section>

        <section className="mt-6 pb-4" aria-label={t('stats.participants')}>
          <h3 className="m-0 mb-3 text-sm font-bold">{t('stats.participants')}</h3>
          {stats.participants.length === 0 ? <p className="rounded-xl border border-line bg-panel p-4 text-sm text-muted">{t('stats.noMemberRecords')}</p> : <>
            <section className="rounded-xl border border-line bg-panel p-4 sm:p-5"
              aria-label={t('stats.participantTrend')}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="m-0 text-sm font-bold">{t('stats.participantTrend')}</h4>
                  <p className="m-0 mt-1 text-xs text-muted">{participantPeriodRange} · {stats.timeZone}</p>
                </div>
                <div className="flex rounded-lg border border-line p-0.5" role="group"
                  aria-label={t('stats.participantTrend')}>
                  {periods.map((option) => <button key={option} type="button"
                    aria-pressed={participantPeriod === option} onClick={() => setParticipantPeriod(option)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple-light ${participantPeriod === option
                      ? 'bg-purple/25 text-purple-light' : 'text-muted hover:text-ink'}`}>
                    {t(`stats.${option}`)}
                  </button>)}
                </div>
              </div>
              {stats.participants.every((person) => person.plays === 0) ? <p className="grid h-52 place-items-center text-sm text-muted">{t('stats.empty')}</p> : <>
                <LineChart data={participantPoints} responsive style={{ width: '100%', height: 224 }}
                  margin={{ top: 24, right: 8, bottom: 0, left: -14 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,.08)" />
                  <XAxis dataKey="key" tickLine={false} axisLine={false} minTickGap={12}
                    tick={{ fill: '#a7a2b4', fontSize: 10 }}
                    tickFormatter={(key: string) => periodLabel(key, participantPeriod, locale, stats.timeZone, true)} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36}
                    ticks={participantTicks} domain={[0, participantTicks.at(-1) ?? 1]}
                    tick={{ fill: '#a7a2b4', fontSize: 10 }} />
                  <Tooltip labelFormatter={(label) => periodLabel(String(label), participantPeriod, locale, stats.timeZone)}
                    formatter={(value, name) => [numberFormatter.format(Number(value)), name]}
                    contentStyle={{ background: '#1b1723', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, color: '#f6f4ff' }} />
                  {stats.participants.map((person, index) => <Line key={person.id} type="linear"
                    dataKey={`participant_${index}`} name={person.nickname} stroke={participantColor(person.id)}
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />)}
                </LineChart>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label={t('stats.participantTrend')}>
                  {stats.participants.map((person) => <li key={person.id} className="flex min-w-0 items-center gap-1.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: participantColor(person.id) }} aria-hidden="true" />
                    <span className="max-w-32 truncate" title={person.nickname}>{person.nickname}</span>
                  </li>)}
                </ul>
                <ul className="sr-only" aria-label={t('stats.participantTrend')}>
                  {stats.participants.map((person) => <li key={person.id}>{person.nickname}: {
                    person[participantPeriod].map(({ key, count }) =>
                      `${periodLabel(key, participantPeriod, locale, stats.timeZone)} ${numberFormatter.format(count)}`).join(', ')
                  }</li>)}
                </ul>
              </>}
            </section>
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
              <table className="w-full table-fixed text-xs tabular-nums">
                <colgroup>
                  <col /><col className="w-11 sm:w-[76px]" /><col className="w-11 sm:w-[76px]" /><col className="w-11 sm:w-[76px]" />
                </colgroup>
                <thead><tr className="border-b border-line text-[11px] text-muted">
                  <th scope="col" className="py-2 pr-2 pl-3 text-left font-medium sm:pl-4">{t('stats.participant')}</th>
                  <th scope="col" className="py-2 text-center font-medium" title={t('stats.playCount')}>{t('stats.playCount')}</th>
                  <th scope="col" className="py-2 text-center font-medium" title={t('stats.totalUpvotes')}><ThumbsUp size={14} className="mx-auto" aria-hidden="true" /><span className="sr-only">{t('stats.totalUpvotes')}</span></th>
                  <th scope="col" className="py-2 text-center font-medium" title={t('stats.totalDownvotes')}><ThumbsDown size={14} className="mx-auto" aria-hidden="true" /><span className="sr-only">{t('stats.totalDownvotes')}</span></th>
                </tr></thead>
                <tbody>{stats.participants.map((person) => <tr key={person.id} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-2.5 pr-2 pl-3 text-left font-semibold sm:pl-4">
                    <span className="flex min-w-0 items-center gap-2">
                      {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" />
                        : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-purple/20 text-[11px] font-bold text-purple-light">{person.nickname.slice(0, 1)}</span>}
                      <span className="truncate" title={person.nickname}>{person.nickname}</span>
                    </span>
                  </th>
                  <td className="text-center">{numberFormatter.format(person.plays)}</td>
                  <td className="text-center text-lime">{numberFormatter.format(person.upvotes)}</td>
                  <td className="text-center text-danger">{numberFormatter.format(person.downvotes)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">{t('stats.votesNote')}</p>
          </>}
        </section>
      </>}
    </div>
  </section>
}
