/**
 * Audio URL configuration (single source of truth).
 *
 * FreeSWITCH fetches TTS audio and cue files over HTTP from the voice-app's own
 * HTTP server. The base URL used to be hardcoded to `http://127.0.0.1:3000`,
 * which broke whenever `HTTP_PORT` was changed. This module centralizes the
 * base URL so TTS, beeps, and hold music all derive from one configured value.
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const fs = require('fs');
const path = require('path');

const STATIC_DIR = path.join(__dirname, '..', 'static');

let httpHost = process.env.HTTP_HOST || DEFAULT_HOST;
let httpPort = parseInt(process.env.HTTP_PORT, 10) || DEFAULT_PORT;

function setHttpHost(host) {
  if (host) httpHost = host;
}

function setHttpPort(port) {
  const p = parseInt(port, 10);
  if (p) httpPort = p;
}

function getBaseUrl() {
  return `http://${httpHost}:${httpPort}`;
}

function audioFileUrl(filename) {
  return `${getBaseUrl()}/audio-files/${filename}`;
}

function staticUrl(filename) {
  return `${getBaseUrl()}/static/${filename}`;
}

/**
 * Check whether a file exists in voice-app/static. Used to skip optional cues
 * (for example hold music) instead of requesting a URL that 404s.
 * @param {string} filename
 * @returns {boolean}
 */
function staticFileExists(filename) {
  try {
    return fs.existsSync(path.join(STATIC_DIR, filename));
  } catch {
    return false;
  }
}

module.exports = {
  setHttpHost,
  setHttpPort,
  getBaseUrl,
  audioFileUrl,
  staticUrl,
  staticFileExists,
  // Resolved cue URLs (re-evaluated each access so config changes take effect)
  get READY_BEEP_URL() { return staticUrl('ready-beep.wav'); },
  get GOTIT_BEEP_URL() { return staticUrl('gotit-beep.wav'); },
  get HOLD_MUSIC_URL() { return staticUrl('hold-music.mp3'); },
};
