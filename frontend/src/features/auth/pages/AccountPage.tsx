import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ListVideo, UserRound } from 'lucide-react'
import { useAuth } from '../context'
import { accountApi, type YouTubePlaylist, type YouTubeStatus } from '../accountApi'
import { Brand } from '../../../shared/ui/Brand'
import { AccountMenu } from '../components/AccountMenu'
import { AccountConfirmationDialog, type AccountConfirmation } from '../components/AccountConfirmationDialog'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, formControlStyles } from '../../../shared/styles'

export function AccountPage() {
  const { user, loading, loginUrl, refresh, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | undefined>()
  const [status, setStatus] = useState<YouTubeStatus | null>(null)
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([])
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [listed, setListed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [retry, setRetry] = useState(0)
  const [pendingConfirmation, setPendingConfirmation] = useState<AccountConfirmation | null>(null)
  const fileVersion = useRef(0)
  const mounted = useRef(false)
  const id = useId()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setName(user?.displayName ?? ''); setAvatar(undefined) }, [user?.displayName, user?.avatarUrl])
  useEffect(() => {
    if (!user?.id) return
    let active = true
    void accountApi.youtubeStatus().then(value => { if (active) setStatus(value) })
      .catch(cause => { if (active) setError(getErrorMessage(cause, t)) })
    return () => { active = false }
  }, [user, retry, t])
  useEffect(() => {
    if (params.has('youtubeError')) setError(t('account.connectionError'))
    else if (params.has('youtubeConnected') || params.has('discordSynced')) setNotice(t('account.connectionDone'))
    if (params.has('youtubeError') || params.has('youtubeConnected') || params.has('discordSynced')) {
      const next = new URLSearchParams(params)
      for (const key of ['youtubeError', 'youtubeConnected', 'discordSynced']) next.delete(key)
      setParams(next, { replace: true })
    }
  }, [params, setParams, t])
  async function run(key: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(key); setError(''); setNotice('')
    try { await action() } catch (cause) { if (mounted.current) setError(getErrorMessage(cause, t)) }
    finally { if (mounted.current) setBusy('') }
  }
  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(t('account.photoError')); return }
    const version = ++fileVersion.current
    setBusy('photo'); setError('')
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = 256; canvas.height = 256
      const edge = Math.min(bitmap.width, bitmap.height)
      canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, 256, 256)
      bitmap.close()
      const photo = canvas.toDataURL('image/webp', 0.85)
      if (!photo.startsWith('data:image/webp;') || photo.length > 280000) throw new Error('image')
      if (mounted.current && version === fileVersion.current) setAvatar(photo)
    } catch { if (mounted.current) setError(t('account.photoError')) }
    finally { if (mounted.current && version === fileVersion.current) setBusy('') }
  }
  function save(event: FormEvent) {
    event.preventDefault()
    void run('profile', async () => { await accountApi.updateProfile(name.trim(), avatar); await refresh(); if (mounted.current) setNotice(t('account.saved')) })
  }
  async function list(pageToken = '') {
    await run('list', async () => {
      const result = await accountApi.playlists(pageToken)
      if (!mounted.current) return
      setPlaylists(current => pageToken ? [...current, ...result.items.filter(p => !current.some(c => c.id === p.id))] : result.items)
      setNextPage(result.nextPageToken); setListed(true)
    })
  }
  function sync(ids: string[]) {
    void run('sync', async () => { const value = await accountApi.sync(ids); if (mounted.current) { setStatus(value); setSelected(new Set()); setNotice(t('account.synced')) } })
  }
  const preview = avatar === undefined ? user?.avatarUrl : avatar
  const disabled = Boolean(busy)
  const card = 'rounded-2xl border border-line bg-panel p-5 sm:p-6'
  return <main className="min-h-dvh bg-canvas text-ink">
    <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-8"><Brand /><AccountMenu compact /></header>
    <div className="mx-auto max-w-3xl px-4 py-7 sm:py-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft size={16} />{t('common.home')}</Link>
      <h1 className="mt-5 mb-2 text-2xl font-bold">{t('account.title')}</h1><p className="mb-7 text-sm text-muted">{t('account.subtitle')}</p>
      {loading ? <p role="status">{t('library.loading')}</p> : !user ? <a className={buttonStyles({ intent: 'primary' })} href={loginUrl('/account')}>{t('auth.loginWithDiscord')}</a> : <div className="grid gap-5">
        {error && <div className="rounded-lg border border-danger/30 p-3 text-sm text-danger" role="alert">{error}</div>}
        {notice && <p className="text-sm text-lime" role="status">{notice}</p>}
        <section className={card} aria-labelledby={`${id}-profile`}>
          <h2 id={`${id}-profile`} className="mb-5 flex items-center gap-2 text-lg font-bold"><UserRound size={20} />{t('account.profile')}</h2>
          <form onSubmit={save} className="grid gap-5">
            <div className="flex flex-wrap items-center gap-4">
              {preview ? <img src={preview} alt="" className="size-20 rounded-full object-cover" /> : <span className="grid size-20 place-items-center rounded-full bg-purple/20 text-2xl font-bold">{name.slice(0, 1)}</span>}
              <div className="grid gap-2"><label className={cn(buttonStyles({ size: 'sm' }), 'relative cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-purple-light', disabled && 'opacity-45')}>
                  <span>{t('account.changePhoto')}</span>
                  <input id={`${id}-photo`} aria-label={t('account.changePhoto')} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => void choosePhoto(event)} />
                </label>
                <button type="button" disabled={disabled} className="text-left text-xs text-muted underline focus-visible:outline-purple-light" onClick={() => { fileVersion.current++; setAvatar('') }}>{t('account.removePhoto')}</button></div>
            </div>
            <div><label htmlFor={`${id}-name`} className="mb-2 block text-sm">{t('account.name')}</label><input id={`${id}-name`} className={formControlStyles()} value={name} onChange={e => setName(e.target.value)} maxLength={20} required disabled={disabled} /></div>
            <button className={cn(buttonStyles({ intent: 'primary' }), 'justify-self-start')} disabled={disabled || (!name.trim()) || (name.trim() === user.displayName && avatar === undefined)}>{busy === 'profile' ? t('library.loading') : t('account.save')}</button>
          </form>
          <div className="mt-6 border-t border-line pt-5"><p className="mb-3 text-sm text-muted">{t('account.discordHint')}</p><a className={buttonStyles({ size: 'sm' })} href="/api/account/discord/sync" aria-disabled={disabled} onClick={e => { if (disabled) e.preventDefault() }}><RefreshCw size={15} />{t('account.discordSync')}</a></div>
        </section>
        <section className={card} aria-labelledby={`${id}-youtube`}>
          <h2 id={`${id}-youtube`} className="mb-2 flex items-center gap-2 text-lg font-bold"><ListVideo size={20} />{t('account.youtube')}</h2>
          <p className="mb-5 text-sm leading-6 text-muted">{t('account.youtubeHint')}</p>
          {!status ? <button className={buttonStyles({ size: 'sm' })} onClick={() => setRetry(n => n + 1)}>{t('account.retry')}</button> : !status.enabled ? <p className="text-sm text-muted">{t('account.notConfigured')}</p> : !status.connected ? <a href="/api/account/youtube/connect" className={buttonStyles({ intent: 'primary' })}>{t('account.connect')}</a> : <>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-lime">{status.channelTitle}</p><button className={buttonStyles({ size: 'sm' })} disabled={disabled} onClick={() => setPendingConfirmation({ message: t('account.disconnectConfirm'), label: t('account.disconnect'), onConfirm: () => { void run('disconnect', async () => { const value = await accountApi.disconnect(); if (mounted.current) { setStatus(value); setListed(false); setPlaylists([]); setSelected(new Set()) } }) } })}>{t('account.disconnect')}</button></div>
            <div className="mt-4 flex flex-wrap gap-2"><button className={buttonStyles({ size: 'sm' })} disabled={disabled} onClick={() => void list()}>{t('account.choose')}</button><a className={buttonStyles({ size: 'sm' })} href="/api/account/youtube/connect" onClick={e => { if (disabled) e.preventDefault() }}>{t('account.reconnect')}</a></div>
            {status.links.length > 0 && <div className="mt-5 grid gap-3"><h3 className="text-sm font-semibold">{t('account.imported')}</h3>{status.links.map(link => <div key={link.youtubeId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{link.name}</p><p className="mt-1 text-xs text-muted">{new Date(link.syncedAt).toLocaleString(locale)}</p>{link.skippedCount > 0 && <p className="mt-1 text-xs text-muted">{t('account.skipped', { count: link.skippedCount })}</p>}</div><div className="flex gap-2"><button className={buttonStyles({ size: 'sm' })} disabled={disabled} onClick={() => { setPendingConfirmation({ message: t('account.syncConfirm'), label: t('account.update'), onConfirm: () => sync([link.youtubeId]) }) }}>{t('account.update')}</button><button className={buttonStyles({ size: 'sm' })} disabled={disabled} onClick={() => void run('unlink', async () => { const value = await accountApi.unlink(link.youtubeId); if (mounted.current) setStatus(value) })}>{t('account.unlink')}</button></div></div>)}</div>}
            {listed && <div className="mt-5 border-t border-line pt-5"><h3 className="mb-3 text-sm font-semibold">{t('account.available')}</h3>{playlists.length === 0 && <p className="text-sm text-muted">{t('account.empty')}</p>}<div className="grid gap-2">{playlists.map(p => <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={selected.has(p.id)} disabled={disabled || (!selected.has(p.id) && selected.size >= 20)} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(p.id); else next.delete(p.id); return next })} className="size-4 shrink-0 accent-purple-light" />{p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />}<span className="min-w-0"><span className="block truncate text-sm">{p.title}</span><span className="text-xs text-muted">{t('account.tracks', { count: p.trackCount })}</span></span></label>)}</div>{nextPage && <button className={cn(buttonStyles({ size: 'sm' }), 'mt-3')} disabled={disabled} onClick={() => void list(nextPage)}>{t('account.more')}</button>}<button className={cn(buttonStyles({ intent: 'primary' }), 'mt-4')} disabled={disabled || selected.size === 0} onClick={() => { const ids = [...selected]; if (ids.some(id => status.links.some(link => link.youtubeId === id))) setPendingConfirmation({ message: t('account.syncConfirm'), label: t('account.update'), onConfirm: () => sync(ids) }); else sync(ids) }}>{busy === 'sync' ? t('account.syncing') : t('account.import', { count: selected.size })}</button></div>}
          </>}
        </section>
        <section className={cn(card, 'border-danger/25')} aria-labelledby={`${id}-delete`}><h2 id={`${id}-delete`} className="mb-2 text-lg font-bold">{t('account.delete')}</h2><p className="mb-4 text-sm leading-6 text-muted">{t('account.deleteHint')}</p><form className="grid gap-3" onSubmit={e => { e.preventDefault(); setPendingConfirmation({ message: t('account.deleteConfirm'), label: t('account.delete'), danger: true, onConfirm: () => { void run('delete', async () => { await accountApi.remove(confirmation); await logout(); navigate('/', { replace: true }) }) } }) }}><label htmlFor={`${id}-confirmation`} className="text-sm">{t('account.confirmName', { name: user.displayName })}</label><input id={`${id}-confirmation`} className={formControlStyles()} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={disabled} autoComplete="off" /><button className={cn(buttonStyles(), 'justify-self-start border-danger/40 text-danger hover:bg-danger/10')} disabled={disabled || confirmation !== user.displayName}>{t('account.delete')}</button></form></section>
      </div>}
    </div>
    <footer className="mx-auto mt-8 flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-xs text-muted">
      <Link className="rounded-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-light" to="/terms">{t('terms.link')}</Link>
      <Link className="rounded-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-light" to="/privacy">{t('privacy.link')}</Link>
    </footer>
    {pendingConfirmation && <AccountConfirmationDialog confirmation={pendingConfirmation} onClose={() => setPendingConfirmation(null)} />}
  </main>
}
