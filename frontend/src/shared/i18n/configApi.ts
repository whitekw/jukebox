import { request } from '../http'
import type { Locale } from './i18n-context'

export function getLocaleConfig() {
  return request<{
    countryCode: string | null
    suggestedLocale: Locale
  }>('/api/config')
}
