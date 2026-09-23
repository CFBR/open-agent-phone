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

module.exports = {
  setHttpHost,
  setHttpPort,
  getBaseUrl,
  audioFileUrl,
  staticUrl,
  // Resolved cue URLs (re-evaluated each access so config changes take effect)
  get READY_BEEP_URL() { return staticUrl('ready-beep.wav'); },
  get GOTIT_BEEP_URL() { return staticUrl('gotit-beep.wav'); },
  get HOLD_MUSIC_URL() { return staticUrl('hold-music.mp3'); },
};
