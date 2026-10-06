const { AppError } = require('./errors')
const { transaction } = require('./db')
const { publicUser } = require('./auth')

function createAccountService(db) {
  function propagate(userId) {
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId))
    if (!user) throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
    const codes = db.prepare(`SELECT DISTINCT rooms.code FROM participants JOIN rooms ON rooms.id = participants.room_id
      WHERE participants.user_id = ? AND participants.profile_source = 'account'`).all(userId).map(r => r.code)
    db.prepare(`UPDATE participants SET nickname = ?, avatar_url = ? WHERE user_id = ? AND profile_source = 'account'`)
      .run(user.displayName.slice(0, 20), user.avatarUrl, userId)
    return { user, codes }
  }
  function update(userId, body) {
    if (typeof body?.displayName !== 'string' || !body.displayName.trim() || body.displayName.trim().length > 20) {
      throw new AppError(400, '이름은 1~20자로 입력해주세요.', 'INVALID_ACCOUNT_PROFILE')
    }
    const avatar = body.avatarUrl
    if (avatar !== undefined && avatar !== null && avatar !== '') {
      if (typeof avatar !== 'string' || avatar.length > 280000 || !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)) {
        throw new AppError(400, '프로필 사진 형식이 올바르지 않습니다.', 'INVALID_ACCOUNT_PROFILE')
      }
      const bytes = Buffer.from(avatar.split(',')[1], 'base64')
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
        throw new AppError(400, '프로필 사진 형식이 올바르지 않습니다.', 'INVALID_ACCOUNT_PROFILE')
      }
    }
    return transaction(db, () => {
      db.prepare('UPDATE users SET custom_name = ?, updated_at = ? WHERE id = ?').run(body.displayName.trim(), Date.now(), userId)
      if (avatar !== undefined) db.prepare('UPDATE users SET custom_avatar = ? WHERE id = ?').run(avatar ?? '', userId)
      return propagate(userId)
    })
  }
  function remove(userId, confirmation) {
    const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId))
    if (!user || confirmation !== user.displayName) throw new AppError(400, '현재 이름을 정확히 입력해주세요.', 'INVALID_ACCOUNT_CONFIRMATION')
    return transaction(db, () => {
      const owned = db.prepare('SELECT code FROM rooms WHERE owner_user_id = ?').all(userId).map(r => r.code)
      const participants = db.prepare('SELECT id FROM participants WHERE user_id = ?').all(userId).map(r => r.id)
      const memberships = db.prepare('SELECT participants.id, rooms.code FROM participants JOIN rooms ON rooms.id = participants.room_id WHERE user_id = ?').all(userId)
      const codes = db.prepare('SELECT DISTINCT rooms.code FROM participants JOIN rooms ON rooms.id = participants.room_id WHERE user_id = ?').all(userId).map(r => r.code)
      const sessions = db.prepare('SELECT token_hash FROM auth_sessions WHERE user_id = ?').all(userId).map(r => r.token_hash)
      for (const id of participants) {
        db.prepare('DELETE FROM participant_access_tokens WHERE participant_id = ?').run(id)
        db.prepare("DELETE FROM room_feed_entries WHERE participant_id = ? AND entry_type = 'message'").run(id)
        db.prepare('UPDATE room_feed_entries SET nickname = NULL WHERE participant_id = ?').run(id)
        db.prepare(`UPDATE room_feed_entries SET event_data = json_set(event_data, '$.target', '탈퇴한 사용자')
          WHERE json_valid(event_data) AND json_extract(event_data, '$.targetParticipantId') = ?`).run(id)
      }
      db.prepare(`UPDATE participants SET nickname = '탈퇴한 사용자', avatar_url = NULL, is_manager = 0,
        token_hash = lower(hex(randomblob(32))), left_at = ?, profile_source = 'custom' WHERE user_id = ?`).run(Date.now(), userId)
      db.prepare('DELETE FROM rooms WHERE owner_user_id = ?').run(userId)
      db.prepare('DELETE FROM users WHERE id = ?').run(userId)
      return { owned, participants, memberships, codes: codes.filter(c => !owned.includes(c)), sessions }
    })
  }
  return { update, propagate, remove }
}
module.exports = { createAccountService }
