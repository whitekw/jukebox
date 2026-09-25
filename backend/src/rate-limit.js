function createRateLimiter({ windowMs, limit, keyForRequest = (req) => `${req.ip}:${req.path}` }) {
  const buckets = new Map()
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }, Math.min(windowMs, 60_000))
  cleanup.unref()

  return function rateLimit(req, res, next) {
    const key = keyForRequest(req)
    const now = Date.now()
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current
    bucket.count += 1
    buckets.set(key, bucket)
    res.setHeader('RateLimit-Limit', String(limit))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)))
    if (bucket.count > limit) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: '잠시 후 다시 시도해주세요.' },
      })
    }
    next()
  }
}

module.exports = { createRateLimiter }

