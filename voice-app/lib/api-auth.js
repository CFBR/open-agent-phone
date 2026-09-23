/**
 * Optional shared-secret auth for the voice-app HTTP API.
 *
 * When the VOICE_API_TOKEN environment variable is set, all /api/* requests
 * must carry it either via the `X-API-Token` header or as a Bearer token in the
 * standard `Authorization` header. When the variable is unset, the middleware
 * is a no-op (backward compatible with existing open deployments).
 *
 * This prevents anyone on the network from triggering outbound calls or
 * running Claude queries through the voice app.
 */

const logger = require('./logger');

// Read the token lazily so runtime env changes (and tests) take effect.
function getToken() {
  return process.env.VOICE_API_TOKEN || '';
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

/**
 * Express middleware factory. Returns middleware that enforces the token.
 */
function createApiAuthMiddleware() {
  return function apiAuth(req, res, next) {
    const token = getToken();
    if (!token) return next(); // auth disabled

    const headerToken =
      req.get('X-API-Token') ||
      (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

    if (!headerToken || !timingSafeEqual(headerToken, token)) {
      logger.warn('API auth rejected', { path: req.path, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Missing or invalid API token',
      });
    }
    next();
  };
}

function isAuthEnabled() {
  return !!getToken();
}

module.exports = {
  createApiAuthMiddleware,
  isAuthEnabled,
  timingSafeEqual,
};
