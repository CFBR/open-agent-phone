/**
 * Per-client fixed-window rate limiter.
 *
 * Kept dependency-free and testable by accepting a clock through options.
 */

const crypto = require('node:crypto');

function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32);
}

/**
 * Prefer a hashed API token over the client IP so one user cannot bypass a
 * limit by rotating addresses, and users behind a shared proxy are separated.
 * @returns {Function} keyGenerator(req)
 */
function createClientKeyGenerator() {
  return function clientKey(req) {
    const token = req.get
      ? (req.get('X-API-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim())
      : '';
    if (token) return `token:${tokenFingerprint(token)}`;

    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    return `ip:${ip}`;
  };
}

function createRateLimiter({
  windowMs = 60000,
  max = 30,
  now = Date.now,
  keyGenerator = null,
  cleanupIntervalMs = 60000,
} = {}) {
  const buckets = new Map();
  let lastSweep = now();

  function sweep(current) {
    if (current - lastSweep < cleanupIntervalMs) return;
    lastSweep = current;
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  function middleware(req, res, next) {
    const current = now();
    sweep(current);

    const key = keyGenerator
      ? keyGenerator(req)
      : (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'rate_limited',
        message: `Too many requests. Retry in ${retryAfter}s.`,
      });
    }

    next();
  }

  middleware.reset = () => buckets.clear();
  middleware.buckets = buckets;
  return middleware;
}

module.exports = { createRateLimiter, createClientKeyGenerator, tokenFingerprint };
