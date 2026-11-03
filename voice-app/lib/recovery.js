/**
 * Reconnection and recovery helpers.
 *
 * These are deliberately dependency-free so the state machine can be tested
 * without drachtio, FreeSWITCH, or timers that keep the process alive.
 */

/**
 * Create a reconnect controller that retries a promise-returning connect
 * function with exponential backoff.
 *
 * @param {Object} options
 * @param {Function} options.connect - () => Promise<result>
 * @param {Function} [options.onConnected] - (result) => void
 * @param {Function} [options.onError] - (error, attempt) => void
 * @param {number} [options.baseMs=1000]
 * @param {number} [options.maxMs=30000]
 * @param {Function} [options.setTimeoutFn]
 * @param {Function} [options.clearTimeoutFn]
 * @returns {Object}
 */
function createReconnectController({
  connect,
  onConnected,
  onError,
  baseMs = 1000,
  maxMs = 30000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (typeof connect !== 'function') {
    throw new Error('createReconnectController requires a connect function');
  }

  let attempt = 0;
  let timer = null;
  let stopped = false;

  function schedule() {
    if (stopped || timer) return;

    const delay = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    attempt++;

    timer = setTimeoutFn(async function () {
      timer = null;
      if (stopped) return;

      try {
        const result = await connect();
        attempt = 0;
        if (onConnected) await onConnected(result);
      } catch (error) {
        if (onError) onError(error, attempt);
        schedule();
      }
    }, delay);

    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function reset() {
    attempt = 0;
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function stop() {
    stopped = true;
    reset();
  }

  return {
    schedule,
    reset,
    stop,
    get pending() { return Boolean(timer); },
    get attempt() { return attempt; },
  };
}

/**
 * Armed watchdog for the "did not recover in time" case. The callback is
 * expected to exit the process so Docker or systemd can restart it.
 *
 * @param {Object} options
 * @param {number} options.timeoutMs - 0 or less disables the watchdog
 * @param {Function} options.onTimeout
 * @param {Function} [options.setTimeoutFn]
 * @param {Function} [options.clearTimeoutFn]
 * @returns {Object}
 */
function createReadinessWatchdog({
  timeoutMs,
  onTimeout,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let timer = null;

  function arm() {
    if (!timeoutMs || timeoutMs <= 0 || timer) return;
    timer = setTimeoutFn(function () {
      timer = null;
      onTimeout();
    }, timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function disarm() {
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  return {
    arm,
    disarm,
    get armed() { return Boolean(timer); },
  };
}

module.exports = {
  createReconnectController,
  createReadinessWatchdog,
};
