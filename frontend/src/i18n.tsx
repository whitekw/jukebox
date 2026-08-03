import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'
import {
  I18nContext,
  type Locale,
  type Translate,
  type TranslationValues,
} from './i18n-context'
import { messages } from './messages'

const LOCALE_STORAGE_KEY = 'jukebox:locale'
const supportedLocales = new Set<Locale>(['ko', 'ja', 'en'])

function isLocale(value: unknown): value is Locale {
  return supportedLocales.has(value as Locale)
}

function readSavedLocale() {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(saved) ? saved : null
  } catch {
    return null
  }
}

function localeFromBrowser(): Locale {
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]
  for (const candidate of candidates) {
    const locale = candidate.toLowerCase().split('-')[0]
    if (isLocale(locale)) return locale
  }
  return 'en'
}

function interpolate(template: string, values: TranslationValues = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] === undefined ? match : String(values[key]),
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => readSavedLocale() ?? localeFromBrowser(),
  )

  useEffect(() => {
    let active = true
    void api.getConfig().then((config) => {
      if (active && !readSavedLocale() && isLocale(config.suggestedLocale)) {
        setLocaleState(config.suggestedLocale)
      }
    }).catch(() => {
      // 로컬 개발이나 일시적인 네트워크 오류에서는 브라우저 언어를 유지한다.
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    } catch {
      // 저장할 수 없는 브라우저에서도 현재 탭의 언어 변경은 유지한다.
    }
  }, [])

  const t = useCallback<Translate>(
    (key, values) => interpolate(messages[locale][key], values),
    [locale],
  )

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
