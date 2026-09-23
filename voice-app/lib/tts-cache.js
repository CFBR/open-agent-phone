/**
 * TTS response cache (dependency-free).
 *
 * Repeated phrases (greetings, thinking phrases, "I didn't hear anything",
 * etc.) used to be re-synthesized on every call because the filename included
 * Date.now(). This module provides a small in-memory cache keyed by
 * provider+voice+text hash so identical requests reuse the existing file.
 *
 * Extracted from tts-service.js so it can be unit-tested without loading axios.
 */

const crypto = require('crypto');

function createTtsCache({ provider, maxSize = 500 } = {}) {
  const cache = new Map(); // key -> filename

  function keyFor(text, voiceId) {
    const hash = crypto.createHash('md5').update(String(text)).digest('hex');
    return `${provider || 'tts'}:${voiceId || 'default'}:${hash}`;
  }

  function get(text, voiceId) {
    return cache.get(keyFor(text, voiceId));
  }

  function set(text, voiceId, filename) {
    if (cache.size >= maxSize) {
      // Evict oldest entry (Map preserves insertion order)
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(keyFor(text, voiceId), filename);
  }

  function remove(text, voiceId) {
    cache.delete(keyFor(text, voiceId));
  }

  function clear() {
    cache.clear();
  }

  return {
    get,
    set,
    remove,
    clear,
    keyFor,
    get size() { return cache.size; },
    _map: cache,
  };
}

module.exports = { createTtsCache };
