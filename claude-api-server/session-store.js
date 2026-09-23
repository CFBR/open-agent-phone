/**
 * SessionStore
 *
 * Tracks per-call AI session metadata and (for non-Claude backends) conversation
 * history. Provides idle eviction so calls that never hit /end-session do not
 * leak memory indefinitely.
 *
 * - sessions:      callId -> claudeSessionId (or `true` placeholder)
 * - histories:      callId -> Array<{role, content}>
 * - lastSeen:       callId -> ms timestamp of last activity
 */

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;        // 30 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

class SessionStore {
  constructor({ idleTtlMs = DEFAULT_IDLE_TTL_MS, sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS } = {}) {
    this.sessions = new Map();
    this.histories = new Map();
    this.lastSeen = new Map();
    this.idleTtlMs = idleTtlMs;
    this.sweepIntervalMs = sweepIntervalMs;
    this._sweepTimer = null;
  }

  /**
   * Mark a callId as active (resets its idle timer).
   */
  touch(callId) {
    if (!callId) return;
    this.lastSeen.set(callId, Date.now());
  }

  hasSession(callId) {
    return this.sessions.has(callId);
  }

  getSession(callId) {
    return this.sessions.get(callId);
  }

  setSession(callId, sessionId) {
    if (!callId) return;
    this.sessions.set(callId, sessionId);
    this.touch(callId);
  }

  hasHistory(callId) {
    return this.histories.has(callId);
  }

  getHistory(callId) {
    return this.histories.get(callId);
  }

  setHistory(callId, messages) {
    if (!callId) return;
    this.histories.set(callId, messages);
    this.touch(callId);
  }

  /**
   * Remove all storage for a callId. Returns true if anything was removed.
   */
  end(callId) {
    if (!callId) return false;
    const had = this.sessions.has(callId) || this.histories.has(callId);
    this.sessions.delete(callId);
    this.histories.delete(callId);
    this.lastSeen.delete(callId);
    return had;
  }

  size() {
    return this.sessions.size + this.histories.size;
  }

  /**
   * Evict entries idle longer than idleTtlMs. Returns the number evicted.
   */
  sweep(now = Date.now()) {
    let evicted = 0;
    for (const [callId, lastSeen] of this.lastSeen.entries()) {
      if (now - lastSeen > this.idleTtlMs) {
        this.sessions.delete(callId);
        this.histories.delete(callId);
        this.lastSeen.delete(callId);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Start the periodic eviction sweep. The timer is unref'd so it does not
   * keep the process alive on shutdown.
   */
  startSweep() {
    if (this._sweepTimer) return;
    this._sweepTimer = setInterval(() => {
      const evicted = this.sweep();
      if (evicted > 0) {
        console.log(`[SWEEP] Evicted ${evicted} idle session(s) (idle > ${Math.round(this.idleTtlMs / 1000)}s)`);
      }
    }, this.sweepIntervalMs);
    if (this._sweepTimer.unref) this._sweepTimer.unref();
  }

  stopSweep() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
  }
}

module.exports = { SessionStore };
