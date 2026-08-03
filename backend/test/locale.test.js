const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getLocaleConfig,
  localeFromAcceptLanguage,
  localeFromCountry,
  normalizeCountryCode,
} = require('../src/locale')

test('normalizes Cloudflare country codes and ignores special codes', () => {
  assert.equal(normalizeCountryCode(' kr '), 'KR')
  assert.equal(normalizeCountryCode('XX'), null)
  assert.equal(normalizeCountryCode('T1'), null)
  assert.equal(normalizeCountryCode('KOR'), null)
})

test('maps supported countries to locales and defaults other countries to English', () => {
  assert.equal(localeFromCountry('KR'), 'ko')
  assert.equal(localeFromCountry('JP'), 'ja')
  assert.equal(localeFromCountry('US'), 'en')
  assert.equal(localeFromCountry(null), null)
})

test('uses the highest-quality supported Accept-Language locale', () => {
  assert.equal(localeFromAcceptLanguage('fr-FR, ja-JP;q=0.8, en;q=0.6'), 'ja')
  assert.equal(localeFromAcceptLanguage('en;q=0.4, ko-KR;q=0.9'), 'ko')
  assert.equal(localeFromAcceptLanguage('fr-FR, de;q=0.8'), null)
})

test('prefers country over Accept-Language and falls back when country is unavailable', () => {
  const request = (headers) => ({
    get(name) {
      return headers[name.toLowerCase()]
    },
  })

  assert.deepEqual(
    getLocaleConfig(request({ 'cf-ipcountry': 'JP', 'accept-language': 'ko-KR' })),
    { countryCode: 'JP', suggestedLocale: 'ja' },
  )
  assert.deepEqual(
    getLocaleConfig(request({ 'accept-language': 'ko-KR, en;q=0.8' })),
    { countryCode: null, suggestedLocale: 'ko' },
  )
  assert.deepEqual(
    getLocaleConfig(request({})),
    { countryCode: null, suggestedLocale: 'en' },
  )
})
