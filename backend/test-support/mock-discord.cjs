const nativeFetch = globalThis.fetch

globalThis.fetch = (input, init) => {
  const url = String(input)
  if (url === 'https://discord.com/api/v10/oauth2/token') {
    return Promise.resolve(Response.json({ access_token: 'test-discord-access' }))
  }
  if (url === 'https://discord.com/api/v10/users/@me') {
    return Promise.resolve(Response.json({
      id: 'test-discord-account',
      username: 'listener',
      global_name: 'Listener',
      avatar: null,
    }))
  }
  return nativeFetch(input, init)
}
