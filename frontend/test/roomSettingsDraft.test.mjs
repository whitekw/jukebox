import assert from 'node:assert/strict'
import test from 'node:test'
import { appendExcludedWord, createRoomSettingsDraft, getDurationErrorField, hasRoomSettingsChanges } from '../src/features/room/roomSettingsDraft.ts'

const room = { title: 'Music', allowGuests: true, historyAutoplay: true,
  autoplayFilters: { excludedWords: ['live'], excludedVideoIds: [], minDurationSeconds: 60, maxDurationSeconds: 600 } }

test('pending keywords are included on save, trimmed and deduplicated', () => {
  assert.deepEqual(appendExcludedWord(['live'], '  remix  '), ['live', 'remix'])
  assert.deepEqual(appendExcludedWord(['live'], 'ＬＩＶＥ'), ['live'])
  assert.deepEqual(appendExcludedWord(['live'], '  '), ['live'])
})

test('keyword limits reject new entries but allow existing ones at capacity', () => {
  const words = Array.from({ length: 50 }, (_, i) => `word${i}`)
  assert.equal(appendExcludedWord(words, 'new'), null)
  assert.equal(appendExcludedWord([], 'x'.repeat(81)), null)
  assert.deepEqual(appendExcludedWord(words, 'WORD0'), words)
})

test('duration validation identifies the input to focus across tab changes', () => {
  const draft = createRoomSettingsDraft(room)
  assert.equal(getDurationErrorField(draft), null)
  for (const [patch, field] of [
    [{ minMinutes: '' }, 'minMinutes'], [{ minSeconds: '60' }, 'minSeconds'],
    [{ maxMinutes: '-1' }, 'maxMinutes'], [{ maxSeconds: '1.5' }, 'maxSeconds'],
    [{ minMinutes: '20' }, 'maxMinutes'], [{ maxMinutes: '1440', maxSeconds: '1' }, 'maxMinutes'],
    [{ minMinutes: '0', maxMinutes: '0', maxSeconds: '0' }, 'maxMinutes'],
  ]) assert.equal(getDurationErrorField({ ...draft, ...patch }), field)
  assert.equal(getDurationErrorField({ ...draft, minMinutes: '0', maxMinutes: '0', maxSeconds: '1' }), null)
  assert.equal(getDurationErrorField({ ...draft, minMinutes: '1440', maxMinutes: '1440' }), null)
})

test('draft status detects pending inputs and returns to clean after a reset', () => {
  const draft = createRoomSettingsDraft(room)
  assert.equal(hasRoomSettingsChanges(draft, room), false)
  assert.equal(hasRoomSettingsChanges({ ...draft, wordInput: 'remix' }, room), true)
  assert.equal(hasRoomSettingsChanges({ ...draft, excludedVideoIds: ['video'] }, room), true)
  assert.equal(hasRoomSettingsChanges(createRoomSettingsDraft(room), room), false)
})
