import { useEffect, useState } from 'react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { noticeStyles } from '../../../shared/styles'

export function AuthNotice() {
  const { t } = useI18n()
  const [error, setError] = useState('')

  useEffect(() => {
    const url = new URL(window.location.href)
    const authError = url.searchParams.get('authError')
    if (!authError) return
    setError(
      authError === 'cancelled'
        ? t('auth.cancelled')
        : authError === 'invalid_state'
          ? t('auth.invalidState')
          : t('auth.failed'),
    )
    url.searchParams.delete('authError')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    const timer = window.setTimeout(() => setError(''), 5_000)
    return () => window.clearTimeout(timer)
  }, [t])

  if (!error) return null
  return <div className={noticeStyles({ tone: 'error' })}>{error}</div>
}
