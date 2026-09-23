const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { pcmStats } = require('./pcm-stats');


class AudioForkSession extends EventEmitter {
  constructor({
    ws,
    callUuid,
    sampleRate = 16000,
    endSilenceMs = 1500,
    minSpeechMs = 350,
    maxUtteranceMs = 60000
  }) {
    super();
    this.ws = ws;
    this.callUuid = callUuid;
    this.sampleRate = sampleRate;

    this.endSilenceMs = endSilenceMs;
    this.minSpeechMs = minSpeechMs;
    this.maxUtteranceMs = maxUtteranceMs;

    this.captureEnabled = true;
    this._pcmEndian = null;

    this._preRollChunks = [];
    this._preRollBytes = 0;
    this._preRollMaxBytes = Math.floor((this.sampleRate * 0.2) * 2);

    this._inSpeech = false;
    this._utteranceChunks = [];
    this._utteranceBytes = 0;
    this._speechBytes = 0;
    this._silenceMs = 0;

    // DEBUG: Track message counts
    this._messageCount = 0;
    this._binaryCount = 0;
    this._lastLogTime = Date.now();

    ws.on('message', (data) => this._onMessage(data));
    ws.on('close', () => {
      console.log('[AUDIO-DEBUG] WebSocket CLOSED for ' + callUuid + '. Total messages: ' + this._messageCount + ', binary: ' + this._binaryCount);
      this.emit('close');
    });
    ws.on('error', (err) => {
      console.log('[AUDIO-DEBUG] WebSocket ERROR for ' + callUuid + ': ' + err.message);
      this.emit('error', err);
    });

    console.log('[AUDIO-DEBUG] AudioForkSession created for ' + callUuid);
  }

  setCaptureEnabled(enabled) {
    const was = this.captureEnabled;
    this.captureEnabled = Boolean(enabled);
    console.log('[AUDIO-DEBUG] setCaptureEnabled: ' + was + ' -> ' + this.captureEnabled + ' for ' + this.callUuid);
    if (!this.captureEnabled) this._resetUtterance();
  }

  _chunkDurationMs(byteLen) {
    const samples = Math.floor(byteLen / 2);
    return (samples / this.sampleRate) * 1000;
  }

  _rememberPreRoll(buf) {
    if (buf.length === 0) return;
    this._preRollChunks.push(buf);
    this._preRollBytes += buf.length;
    while (this._preRollBytes > this._preRollMaxBytes && this._preRollChunks.length > 1) {
      const removed = this._preRollChunks.shift();
      this._preRollBytes -= removed.length;
    }
  }

  _startUtteranceWithPreRoll() {
    this._inSpeech = true;
    this._utteranceChunks = [];
    this._utteranceBytes = 0;
    this._speechBytes = 0;
    this._silenceMs = 0;

    if (this._preRollChunks.length) {
      for (const chunk of this._preRollChunks) this._appendUtterance(chunk, false);
      this._preRollChunks = [];
      this._preRollBytes = 0;
    }
    console.log('[AUDIO-DEBUG] Started utterance with pre-roll for ' + this.callUuid);
  }

  _appendUtterance(buf, countsAsSpeech) {
    this._utteranceChunks.push(buf);
    this._utteranceBytes += buf.length;
    if (countsAsSpeech) this._speechBytes += buf.length;
  }

  _resetUtterance() {
    this._inSpeech = false;
    this._utteranceChunks = [];
    this._utteranceBytes = 0;
    this._speechBytes = 0;
    this._silenceMs = 0;
  }

  _finalizeUtterance(reason) {
    const durationMs = this._chunkDurationMs(this._utteranceBytes);
    const speechMs = this._chunkDurationMs(this._speechBytes);
    const speechRatio = this._utteranceBytes > 0 ? this._speechBytes / this._utteranceBytes : 0;

    const audio = Buffer.concat(this._utteranceChunks);
    this._resetUtterance();

    console.log('[AUDIO-DEBUG] Finalizing utterance: ' + audio.length + ' bytes, ' + Math.round(durationMs) + 'ms duration, ' + Math.round(speechMs) + 'ms speech, ratio=' + speechRatio.toFixed(2) + ', reason=' + reason);

    // For DTMF-triggered finalization, be more lenient with requirements
    const isDtmfTriggered = reason === 'dtmf_trigger';
    const minSpeechRequired = isDtmfTriggered ? 100 : this.minSpeechMs;
    const minRatioRequired = isDtmfTriggered ? 0.05 : 0.12;

    if (speechMs < minSpeechRequired || speechRatio < minRatioRequired) {
      console.log('[AUDIO-DEBUG] Utterance REJECTED: speechMs=' + Math.round(speechMs) + ' < ' + minSpeechRequired + ' OR speechRatio=' + speechRatio.toFixed(2) + ' < ' + minRatioRequired);
      return false;
    }
    console.log('[AUDIO-DEBUG] Utterance ACCEPTED, emitting event');
    this.emit('utterance', { callUuid: this.callUuid, audio, durationMs, speechMs, reason });
    return true;
  }

  /**
   * Force immediate finalization of current utterance (e.g., when # is pressed)
   * Returns true if an utterance was finalized, false if there was nothing to finalize
   */
  forceFinalize() {
    console.log('[AUDIO-DEBUG] forceFinalize called for ' + this.callUuid + ', inSpeech=' + this._inSpeech + ', bytes=' + this._utteranceBytes);

    if (!this._inSpeech || this._utteranceBytes === 0) {
      console.log('[AUDIO-DEBUG] forceFinalize: No speech to finalize');
      return false;
    }

    return this._finalizeUtterance('dtmf_trigger');
  }

  _detectEndian(buf) {
    const le = pcmStats(buf, 'LE');
    const be = pcmStats(buf, 'BE');
    const leScore = le.maxAbs + le.rms;
    const beScore = be.maxAbs + be.rms;
    const result = leScore >= beScore ? 'LE' : 'BE';
    console.log('[AUDIO-DEBUG] Detected endian: ' + result + ' (LE score=' + Math.round(leScore) + ', BE score=' + Math.round(beScore) + ')');
    return result;
  }

  _isSpeechFromStats(stats) {
    const rmsThreshold = 650;
    const maxThreshold = 2200;

    const looksSilent = stats.nearZeroRatio > 0.94 && stats.rms < rmsThreshold;
    if (looksSilent) return false;
    return stats.maxAbs >= maxThreshold || stats.rms >= rmsThreshold;
  }

  // Backwards-compatible wrapper (computes stats from a buffer).
  _isSpeech(buf) {
    if (!this._pcmEndian) this._pcmEndian = this._detectEndian(buf);
    return this._isSpeechFromStats(pcmStats(buf, this._pcmEndian));
  }

  _onMessage(data) {
    this._messageCount++;

    if (typeof data === 'string') {
      console.log('[AUDIO-DEBUG] Received STRING message #' + this._messageCount + ': ' + data.substring(0, 200));
      try {
        const meta = JSON.parse(data);
        this.emit('metadata', meta);
        if (meta && meta.sampleRate && Number.isFinite(Number(meta.sampleRate))) {
          this.sampleRate = Number(meta.sampleRate);
          this._preRollMaxBytes = Math.floor((this.sampleRate * 0.2) * 2);
          console.log('[AUDIO-DEBUG] Updated sampleRate to ' + this.sampleRate);
        }
      } catch {
        this.emit('metadata', data);
      }
      return;
    }

    if (!Buffer.isBuffer(data)) {
      console.log('[AUDIO-DEBUG] Received non-buffer, non-string message type: ' + typeof data);
      return;
    }

    this._binaryCount++;

    // Compute PCM stats once per chunk and reuse for logging + VAD. Endian is
    // detected on the first chunk; afterwards this is a single pass over the
    // samples instead of up to three.
    if (!this._pcmEndian) this._pcmEndian = this._detectEndian(data);
    const stats = pcmStats(data, this._pcmEndian);

    // Log periodically (every 50 chunks or every 5 seconds)
    const now = Date.now();
    if (this._binaryCount % 50 === 1 || now - this._lastLogTime > 5000) {
      console.log('[AUDIO-DEBUG] Binary chunk #' + this._binaryCount + ': ' + data.length + ' bytes, RMS=' + Math.round(stats.rms) + ', max=' + stats.maxAbs + ', nearZero=' + (stats.nearZeroRatio*100).toFixed(1) + '%, captureEnabled=' + this.captureEnabled);
      this._lastLogTime = now;
    }

    if (!this.captureEnabled) {
      return;
    }

    if (data.length < 2) return;

    const isSpeech = this._isSpeechFromStats(stats);
    const chunkMs = this._chunkDurationMs(data.length);

    // Log speech detection periodically
    if (this._binaryCount % 50 === 1) {
      console.log('[AUDIO-DEBUG] VAD: isSpeech=' + isSpeech + ', inSpeech=' + this._inSpeech + ', silenceMs=' + Math.round(this._silenceMs) + ', RMS=' + Math.round(stats.rms) + ', max=' + stats.maxAbs);
    }

    if (!this._inSpeech) {
      this._rememberPreRoll(data);
      if (!isSpeech) return;
      this._startUtteranceWithPreRoll();
    }

    this._appendUtterance(data, isSpeech);

    if (isSpeech) this._silenceMs = 0;
    else this._silenceMs += chunkMs;

    const utteranceMs = this._chunkDurationMs(this._utteranceBytes);
    if (utteranceMs >= this.maxUtteranceMs) return this._finalizeUtterance('max_utterance');
    if (this._silenceMs >= this.endSilenceMs) return this._finalizeUtterance('end_silence');
  }

  waitForUtterance({ timeoutMs = 30000 } = {}) {
    console.log('[AUDIO-DEBUG] waitForUtterance called, timeoutMs=' + timeoutMs + ', captureEnabled=' + this.captureEnabled);
    return new Promise((resolve, reject) => {
      const onUtterance = (u) => {
        cleanup();
        console.log('[AUDIO-DEBUG] waitForUtterance resolved with ' + u.audio.length + ' bytes');
        resolve(u);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('AudioForkSession closed for call ' + this.callUuid));
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const timer = setTimeout(() => {
        cleanup();
        console.log('[AUDIO-DEBUG] waitForUtterance TIMEOUT after ' + timeoutMs + 'ms. Binary chunks received: ' + this._binaryCount);
        reject(new Error('Timed out waiting for utterance (' + timeoutMs + 'ms) for call ' + this.callUuid));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.off('utterance', onUtterance);
        this.off('close', onClose);
        this.off('error', onError);
      };

      this.on('utterance', onUtterance);
      this.on('close', onClose);
      this.on('error', onError);
    });
  }
}

class AudioForkServer extends EventEmitter {
  constructor({ port = 3001, host = '0.0.0.0' } = {}) {
    super();
    this.port = port;
    this.host = host;
    this.wss = null;
    this._pending = [];
    this._sessions = new Map();
  }

  start() {
    if (this.wss) return;
    this.wss = new WebSocket.Server({ port: this.port, host: this.host });

    this.wss.on('connection', (ws, req) => {
      const url = (req && req.url) || '/';
      console.log('[AUDIO-DEBUG] WebSocket connection received, URL: ' + url);

      const path = url.split('?')[0] || '/';
      const candidate = decodeURIComponent(path).replace(/^\/+/, '').trim();

      const callUuidFromUrl = candidate.length ? candidate.split('/')[0] : '';
      const callUuid = callUuidFromUrl || null;

      console.log('[AUDIO-DEBUG] Extracted callUuid from URL: ' + callUuid);

      if (callUuid) {
        const idx = this._pending.findIndex((p) => p.callUuid === callUuid);
        const pending = idx >= 0 ? this._pending.splice(idx, 1)[0] : null;
        if (pending) {
          clearTimeout(pending.timeout);
          console.log('[AUDIO-DEBUG] Found pending expectation for ' + callUuid);
        } else {
          console.log('[AUDIO-DEBUG] No pending expectation for ' + callUuid + ', creating session anyway');
        }

        const session = new AudioForkSession({ ws, callUuid });
        this._sessions.set(callUuid, session);
        session.on('close', () => this._sessions.delete(callUuid));
        session.on('error', () => this._sessions.delete(callUuid));

        this.emit('session', session);
        if (pending) pending.resolve(session);
        return;
      }

      const pending = this._pending.shift();
      if (!pending) {
        console.log('[AUDIO-DEBUG] No pending session and no callUuid in URL, closing connection');
        ws.close(1011, 'No pending audio session');
        return;
      }

      clearTimeout(pending.timeout);
      const session = new AudioForkSession({ ws, callUuid: pending.callUuid });
      this._sessions.set(pending.callUuid, session);
      session.on('close', () => this._sessions.delete(pending.callUuid));
      session.on('error', () => this._sessions.delete(pending.callUuid));

      this.emit('session', session);
      pending.resolve(session);
    });

    this.wss.on('listening', () => {
      console.log('[AUDIO-DEBUG] WebSocket server listening on ' + this.host + ':' + this.port);
      this.emit('listening', { host: this.host, port: this.port });
    });
    this.wss.on('error', (err) => this.emit('error', err));
  }

  stop() {
    if (!this.wss) return;
    this.wss.close();
    this.wss = null;
    this._pending = [];
    this._sessions.clear();
  }

  /**
   * Cancel a pending session expectation (call this when a call ends before session connects)
   */
  cancelExpectation(callUuid) {
    const idx = this._pending.findIndex((p) => p.callUuid === callUuid);
    if (idx >= 0) {
      const pending = this._pending.splice(idx, 1)[0];
      clearTimeout(pending.timeout);
      console.log('[AUDIO-DEBUG] Cancelled pending expectation for ' + callUuid);
      return true;
    }
    return false;
  }

  expectSession(callUuid, { timeoutMs = 5000 } = {}) {
    console.log('[AUDIO-DEBUG] expectSession called for ' + callUuid + ', timeoutMs=' + timeoutMs);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this._pending.findIndex((p) => p.callUuid === callUuid);
        if (idx >= 0) this._pending.splice(idx, 1);
        console.log('[AUDIO-DEBUG] expectSession TIMEOUT for ' + callUuid + ' (this is handled, not a crash)');
        reject(new Error('Timed out waiting for WebSocket audio session (' + timeoutMs + 'ms) for call ' + callUuid));
      }, timeoutMs);

      this._pending.push({ callUuid, resolve, reject, timeout });
    });
  }

  getSession(callUuid) {
    return this._sessions.get(callUuid);
  }
}

module.exports = { AudioForkServer, AudioForkSession };
