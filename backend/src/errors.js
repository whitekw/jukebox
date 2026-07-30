class AppError extends Error {
  constructor(status, message, code = 'APP_ERROR') {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
}

module.exports = { AppError }

