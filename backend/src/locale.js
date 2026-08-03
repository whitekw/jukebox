const SUPPORTED_LOCALES = new Set(['ko', 'ja', 'en'])
const UNKNOWN_COUNTRY_CODES = new Set(['XX', 'T1'])

function normalizeCountryCode(value) {
  const countryCode = String(value ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) return null
  return UNKNOWN_COUNTRY_CODES.has(countryCode) ? null : countryCode
}

function localeFromCountry(countryCode) {
  if (countryCode === 'KR') return 'ko'
  if (countryCode === 'JP') return 'ja'
  return countryCode ? 'en' : null
}

function localeFromAcceptLanguage(value) {
  const languages = String(value ?? '')
    .split(',')
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(';')
      const quality = parameters
        .map((parameter) => parameter.trim().match(/^q=(0(?:\.\d+)?|1(?:\.0+)?)$/i))
        .find(Boolean)
      return {
        locale: tag.toLowerCase().split('-')[0],
        quality: quality ? Number(quality[1]) : 1,
      }
    })
    .filter(({ locale, quality }) => SUPPORTED_LOCALES.has(locale) && quality > 0)
    .sort((left, right) => right.quality - left.quality)

  return languages[0]?.locale ?? null
}

function getLocaleConfig(req) {
  const countryCode = normalizeCountryCode(req.get('cf-ipcountry'))
  const suggestedLocale =
    localeFromCountry(countryCode) ??
    localeFromAcceptLanguage(req.get('accept-language')) ??
    'en'

  return { countryCode, suggestedLocale }
}

module.exports = {
  getLocaleConfig,
  localeFromAcceptLanguage,
  localeFromCountry,
  normalizeCountryCode,
}
