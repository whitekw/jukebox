import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Settings, Trash2 } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, formControlStyles } from '../../../shared/styles'
import { PanelHeader } from '../../../shared/ui/PanelHeader'
import type { RoomState } from '../types'
import { AutoplayFilterEditor } from './AutoplayFilterEditor'
import { appendExcludedWord, createRoomSettingsDraft, getDurationErrorField, hasRoomSettingsChanges,
  type DurationField, type RoomSettings, type RoomSettingsDraft } from '../roomSettingsDraft'

export function RoomSettingsPanel({ room, draft, onDraftChange, onSave, onDelete, onClose }: {
  room: RoomState
  draft: RoomSettingsDraft
  onDraftChange: (draft: RoomSettingsDraft) => void
  onSave: (settings: RoomSettings) => Promise<void>
  onDelete: (confirmationName: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const { title, allowGuests, historyAutoplay, excludedWords, excludedVideoIds, wordInput } = draft
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [durationError, setDurationError] = useState<DurationField | null>(null)
  const [wordError, setWordError] = useState('')
  const [focusField, setFocusField] = useState<string | null>(null)
  const [deleteName, setDeleteName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [tab, setTab] = useState<'general' | 'autoplay'>('general')
  const confirmationName = room.title || room.code
  const dirty = hasRoomSettingsChanges(draft, room)
  const busyRef = useRef(false)
  const wordInputId = `${titleId}-word`

  useLayoutEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    closeRef.current?.focus()
    return () => {
      if (panel?.contains(document.activeElement)) trigger?.focus()
    }
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog:modal')) return
      event.preventDefault()
      if (!busyRef.current) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useEffect(() => {
    if (!focusField) return
    const input = document.getElementById(focusField)
    input?.focus()
    input?.scrollIntoView({ block: 'nearest' })
    setFocusField(null)
  }, [focusField, tab])

  function updateDraft(patch: Partial<RoomSettingsDraft>) {
    onDraftChange({ ...draft, ...patch })
    setError('')
    if (Object.keys(patch).some((key) => /^(min|max)/.test(key))) setDurationError(null)
    if ('wordInput' in patch || 'excludedWords' in patch) setWordError('')
  }

  function addWord() {
    const words = appendExcludedWord(excludedWords, wordInput)
    if (!words) { setWordError(t('roomSettings.wordLimit')); return }
    updateDraft({ excludedWords: words, wordInput: '' })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const invalidDuration = getDurationErrorField(draft)
    setDurationError(invalidDuration)
    if (invalidDuration) {
      setTab('autoplay')
      setFocusField(`${titleId}-${invalidDuration}`)
      return
    }
    const words = appendExcludedWord(excludedWords, wordInput)
    if (!words) {
      setWordError(t('roomSettings.wordLimit'))
      setTab('autoplay')
      setFocusField(wordInputId)
      return
    }
    const minDurationSeconds = Number(draft.minMinutes) * 60 + Number(draft.minSeconds)
    const maxDurationSeconds = Number(draft.maxMinutes) * 60 + Number(draft.maxSeconds)
    busyRef.current = true
    setSaving(true)
    setError('')
    try {
      await onSave({
        title,
        allowGuests,
        historyAutoplay,
        autoplayFilters: {
          excludedWords: words,
          excludedVideoIds,
          minDurationSeconds,
          maxDurationSeconds,
        },
      })
      onClose()
    } catch (cause) {
      setError(getErrorMessage(cause, t))
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }

  async function deleteRoom() {
    if (busyRef.current || deleteName !== confirmationName) return
    busyRef.current = true
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete(deleteName)
    } catch (cause) {
      busyRef.current = false
      setDeleteError(getErrorMessage(cause, t))
      setDeleting(false)
    }
  }

  return <section ref={panelRef} aria-labelledby={titleId}
    className="@container/settings absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-canvas text-ink">
    <PanelHeader titleId={titleId} title={t('roomSettings.heading')}
      subtitle={t('roomSettings.subtitle', { code: room.code })}
      icon={<Settings size={20} aria-hidden="true" />} closeLabel={t('common.close')}
      onClose={() => { if (!busyRef.current) onClose() }} closeButtonRef={closeRef} />
    <form className="flex min-h-0 flex-1 flex-col" noValidate
      onSubmit={(event) => void submit(event)}>
      <div className="flex shrink-0 gap-1 border-b border-line px-4 sm:px-6" role="tablist" aria-label={t('roomSettings.heading')}>
        {(['general', 'autoplay'] as const).map((option) => <button key={option} type="button"
          id={`${titleId}-${option}-tab`} role="tab" aria-selected={tab === option}
          aria-controls={`${titleId}-${option}-panel`} tabIndex={tab === option ? 0 : -1}
          onClick={() => setTab(option)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 'general' : event.key === 'End' ? 'autoplay'
              : option === 'general' ? 'autoplay' : 'general'
            setTab(next)
            const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next === 'general' ? 0 : 1]
            target?.focus()
          }}
          className={cn('border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple-light',
            tab === option ? 'border-purple-light text-purple-light' : 'border-transparent text-muted hover:text-ink')}>
          {t(option === 'general' ? 'roomSettings.general' : 'roomSettings.autoplaySection')}
        </button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-width:thin] sm:px-6">
        <div className="mx-auto w-full max-w-4xl pb-2">
          {tab === 'general' ? <section id={`${titleId}-general-panel`} role="tabpanel"
            aria-labelledby={`${titleId}-general-tab`}>
            <div className="space-y-5 rounded-xl border border-line bg-panel p-4 @[36rem]/settings:p-5">
              <div className="min-w-0">
                <label className="block text-sm font-semibold" htmlFor={`${titleId}-room-title`}>{t('roomSettings.titleLabel')}</label>
                <p className="mt-1 text-xs leading-5 text-muted">{t('roomSettings.titleHint')}</p>
                <input className={cn(formControlStyles({ size: 'large' }), 'mt-3')} id={`${titleId}-room-title`}
                  value={title} onChange={(event) => updateDraft({ title: event.target.value })} maxLength={60}
                  placeholder={room.code} disabled={saving || deleting} />
              </div>
              <label className="flex min-w-0 cursor-pointer items-center justify-between gap-4 border-t border-line pt-5">
                <span className="min-w-0"><strong className="block text-sm">{t('roomSettings.allowGuestsLabel')}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted">{t('roomSettings.allowGuestsHint')}</span></span>
                <input className="size-5 shrink-0 accent-purple-light" type="checkbox"
                  checked={allowGuests} onChange={(event) => updateDraft({ allowGuests: event.target.checked })} disabled={saving || deleting} />
              </label>
            </div>
            <details className="group mt-6 overflow-hidden rounded-xl border border-danger/30 bg-panel">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 text-sm font-semibold text-danger marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
                <Trash2 size={17} aria-hidden="true" />
                <span className="flex-1">{t('roomSettings.deleteRoom')}</span>
                <ChevronDown size={17} className="transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <p className="text-sm leading-6 text-muted">{t('roomSettings.deleteWarning')}</p>
                <p className="mt-3 text-sm text-ink">{t('roomSettings.deleteInstruction')}
                  <strong className="ml-2 select-text font-semibold">{confirmationName}</strong>
                </p>
                <div className="mt-4 flex flex-col items-start gap-3 @[36rem]/settings:flex-row @[36rem]/settings:items-end">
                  <label className="w-full max-w-sm text-xs font-semibold text-muted" htmlFor={`${titleId}-delete-name`}>
                    <span className="mb-2 block">{t('roomSettings.deleteNameLabel')}</span>
                    <input id={`${titleId}-delete-name`} className={formControlStyles({ size: 'default' })}
                      value={deleteName} onChange={(event) => setDeleteName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }}
                      autoComplete="off" spellCheck={false} disabled={saving || deleting} />
                  </label>
                  <button type="button" disabled={saving || deleting || deleteName !== confirmationName}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-danger/50 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-danger disabled:opacity-40"
                    onClick={() => void deleteRoom()}>
                    <Trash2 size={16} aria-hidden="true" />
                    {deleting ? t('roomSettings.deleting') : t('roomSettings.deleteRoom')}
                  </button>
                </div>
                {deleteError && <p className="mt-3 text-sm text-danger" role="alert">{deleteError}</p>}
              </div>
            </details>
          </section> : <section id={`${titleId}-autoplay-panel`} role="tabpanel"
            aria-labelledby={`${titleId}-autoplay-tab`} className="space-y-5">
            <div className="rounded-xl border border-line bg-panel p-4 @[36rem]/settings:p-5">
                <label className={cn('flex min-w-0 items-center justify-between gap-4',
                  room.autoplayHistoryCount < 10 ? 'text-muted' : 'cursor-pointer')}>
                  <span className="min-w-0"><strong className="block text-sm">{t('roomSettings.historyAutoplayLabel')}</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted">{room.autoplayHistoryCount < 10
                      ? t('roomSettings.historyAutoplayLocked', { count: room.autoplayHistoryCount })
                      : t('roomSettings.historyAutoplayHint')}</span></span>
                  <input className="size-5 shrink-0 accent-purple-light" type="checkbox"
                    checked={historyAutoplay} onChange={(event) => updateDraft({ historyAutoplay: event.target.checked })}
                    disabled={saving || deleting || room.autoplayHistoryCount < 10} />
                </label>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-purple/10 px-3 py-2">
                <span className="text-xs text-muted">{t('roomSettings.poolLabel')}</span>
                <strong className="text-sm tabular-nums text-purple-light">{t('roomSettings.poolCount', { count: room.autoplayPoolCount })}</strong>
              </div>
              <fieldset className="mt-5 min-w-0 border-t border-line pt-5">
                <legend className="sr-only">{t('roomSettings.durationLabel')}</legend>
                <h4 className="text-sm font-semibold">{t('roomSettings.durationLabel')}</h4>
                <p className="mt-1 text-xs leading-5 text-muted">{t('roomSettings.durationHint')}</p>
                <div className="mt-4 grid gap-4 @[36rem]/settings:grid-cols-2">
                  {([
                    { label: t('roomSettings.minDuration'), id: 'min' },
                    { label: t('roomSettings.maxDuration'), id: 'max' },
                  ] as const).map((bound) => <div key={bound.id} className="min-w-0">
                    <p className="mb-2 text-xs font-semibold text-muted">{bound.label}</p>
                    <div className="flex items-center gap-2">
                      {(['Minutes', 'Seconds'] as const).map((unit) => {
                        const field = `${bound.id}${unit}` as DurationField
                        const unitLabel = t(unit === 'Minutes' ? 'roomSettings.minutes' : 'roomSettings.seconds')
                        const shortUnitLabel = t(unit === 'Minutes' ? 'roomSettings.minutesShort' : 'roomSettings.secondsShort')
                        return <label key={unit} className="relative min-w-0 flex-1" htmlFor={`${titleId}-${field}`}>
                          <input id={`${titleId}-${field}`} className={cn(formControlStyles({ size: 'default' }),
                            'pr-10 tabular-nums', durationError === field && 'border-danger')}
                            type="text" inputMode="numeric" value={draft[field]}
                            aria-label={`${bound.label} · ${unitLabel}`} aria-invalid={durationError === field}
                            aria-describedby={durationError ? `${titleId}-duration-error` : undefined}
                            onChange={(event) => updateDraft({ [field]: event.target.value })} disabled={saving || deleting} />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted" aria-hidden="true">{shortUnitLabel}</span>
                        </label>
                      })}
                    </div>
                  </div>)}
                </div>
                {durationError && <p id={`${titleId}-duration-error`} className="mt-3 text-sm text-danger" role="alert">{t('roomSettings.durationError')}</p>}
              </fieldset>
            </div>
            <section aria-labelledby={`${titleId}-filters`}>
              <h3 id={`${titleId}-filters`} className="text-sm font-semibold">{t('roomSettings.filtersSection')}</h3>
              <p className="mt-1 text-xs leading-5 text-muted">{t('roomSettings.filterHint')}</p>
              <AutoplayFilterEditor code={room.code} excludedWords={excludedWords}
                onWordsChange={(words) => updateDraft({ excludedWords: words })} excludedVideoIds={excludedVideoIds}
                onVideoIdsChange={(ids) => updateDraft({ excludedVideoIds: ids })} disabled={saving || deleting}
                wordInput={wordInput} wordInputId={wordInputId} wordError={wordError}
                onWordInputChange={(value) => updateDraft({ wordInput: value })} onAddWord={addWord} />
            </section>
          </section>}
        </div>
      </div>
      <div className="shrink-0 border-t border-line bg-canvas px-4 py-3 sm:px-6">
        {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <p className="min-w-0 basis-full text-xs text-muted @[36rem]/settings:flex-1 @[36rem]/settings:basis-auto" role="status">
            {t(dirty ? 'roomSettings.unsaved' : 'roomSettings.saved')}
          </p>
          {dirty && <button type="button" className={buttonStyles({ intent: 'outline', size: 'md' })}
            disabled={saving || deleting} onClick={() => {
              onDraftChange(createRoomSettingsDraft(room)); setError(''); setDurationError(null); setWordError('')
            }}>{t('roomSettings.reset')}</button>}
          <button className={cn(buttonStyles({ intent: 'primary', size: 'md' }), 'min-w-28 flex-1 @[36rem]/settings:flex-none')}
            type="submit" disabled={saving || deleting || !dirty}>{saving ? t('roomSettings.saving') : t('roomSettings.save')}</button>
        </div>
      </div>
    </form>
  </section>
}
