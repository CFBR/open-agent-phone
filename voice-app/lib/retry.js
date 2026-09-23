/**
 * Generic retry helper (dependency-free).
 *
 * Retries an async function when it throws a transient error: network blips
 * (timeout / connection reset / refused) or HTTP 429 / 5xx responses.
 * Extracted as a module so it can be unit-tested without loading axios/ws.
 */

const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNABORTED',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
]);

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isTransientError(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  const status = err.response && err.response.status;
  if (TRANSIENT_STATUS.has(status)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying up to `retries` times on transient errors.
 *
 * @param {Function} fn - async function to run
 * @param {Object} [options]
 * @param {number} [options.retries=2] - number of retry attempts after the first
 * @param {number} [options.baseDelayMs=500] - base backoff; delay = base * 2^(attempt-1)
 * @param {Function} [options.shouldRetry] - (err, attempt) => boolean override
 * @returns {Promise<*>} result of fn
 */
async function withRetry(fn, options = {}) {
  const retries = options.retries != null ? options.retries : DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : DEFAULT_BASE_DELAY_MS;
  const shouldRetry = options.shouldRetry || isTransientError;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !shouldRetry(err, attempt)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = {
  withRetry,
  isTransientError,
  TRANSIENT_CODES,
  TRANSIENT_STATUS,
};
