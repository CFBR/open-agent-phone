/**
 * HTTP Server for TTS Audio Delivery
 *
 * Express server that:
 * 1. Serves generated TTS audio files to FreeSWITCH
 * 2. Provides health check endpoint
 * 3. Accepts audio uploads and returns playback URLs
 * 4. Automatically cleans up old temporary files
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const debug = require('debug')('voice-app:http-server');
const crypto = require('crypto');
const audioCleanup = require('./audio-cleanup');

// Re-exported for backwards compatibility; the implementation lives in
// audio-cleanup.js so it can be used/tested without loading express.
const cleanupOldFiles = audioCleanup.cleanupOldFiles;
const CLEANUP_INTERVAL = audioCleanup.CLEANUP_INTERVAL;
const FILE_MAX_AGE = audioCleanup.FILE_MAX_AGE;

/**
 * Create HTTP Server
 *
 * @param {string} audioDir - Directory to serve audio files from
 * @param {number} port - Port to listen on (default: 3000)
 * @param {Object} [options]
 * @param {Function} [options.getHealthInfo] - () => Object merged into /health
 * @returns {Object} { app, server, saveAudio, getAudioUrl, close, finalize }
 */
function createHttpServer(audioDir, port = 3000, options = {}) {
  const app = express();
  const getHealthInfo = options.getHealthInfo || (() => ({}));

  // Parse JSON bodies
  app.use(express.json());

  // Parse binary bodies for audio upload
  app.use('/audio', express.raw({ type: 'audio/*', limit: '10mb' }));

  // Serve static audio files
  app.use('/audio-files', express.static(audioDir, {
    setHeaders: (res, filepath) => {
      // Set appropriate content type for audio files
      if (filepath.endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav');
      } else if (filepath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg');
      }
    }
  }));

  // Serve STATIC audio files (beeps, hold music) - NOT subject to cleanup
  app.use('/static', express.static(path.join(__dirname, '..', 'static'), {
    setHeaders: (res, filepath) => {
      if (filepath.endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav');
      } else if (filepath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg');
      }
    }
  }));

  // Health check endpoint
  app.get('/health', async (req, res) => {
    const base = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      audioDir,
      port
    };
    try {
      const extra = await getHealthInfo();
      res.json({ ...base, ...extra });
    } catch (err) {
      res.json({ ...base, healthError: err.message });
    }
  });

  // Audio upload endpoint
  app.post("/audio", async (req, res) => {
    try {
      const audioBuffer = req.body;

      if (!audioBuffer || audioBuffer.length === 0) {
        return res.status(400).json({
          error: 'No audio data provided'
        });
      }

      // Generate unique filename
      const filename = `audio_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.wav`;
      const filepath = path.join(audioDir, filename);

      debug(`Saving audio to ${filepath} (${audioBuffer.length} bytes)`);

      // Save to disk
      await fs.writeFile(filepath, audioBuffer);

      // Generate URL
      const url = `http://localhost:${port}/audio-files/${filename}`;

      debug(`Audio saved, URL: ${url}`);

      res.json({
        success: true,
        url,
        filename,
        size: audioBuffer.length
      });

    } catch (error) {
      console.error('Error saving audio:', error);
      res.status(500).json({
        error: 'Failed to save audio',
        message: error.message
      });
    }
  });

  // NOTE: 404 and error handlers are added in finalize() AFTER additional routes

  // Start server
  const server = app.listen(port, () => {
    debug(`HTTP server listening on port ${port}`);
    debug(`Serving audio files from ${audioDir}`);
  });

  // NOTE: Periodic audio-file cleanup is owned by index.js (single source of
  // truth) so we don't run multiple competing cleanup loops. cleanupOldFiles
  // is still exported below for manual/programmatic use and tests.

  const originalClose = server.close.bind(server);
  server.close = (callback) => {
    debug('Stopping HTTP server');
    originalClose(callback);
  };

  /**
   * Save audio buffer to file and return URL
   * @param {Buffer} audioBuffer - Audio data
   * @param {string} format - File format (wav, mp3)
   * @returns {Promise<string>} URL to audio file
   */
  async function saveAudio(audioBuffer, format = 'wav') {
    const filename = `audio_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${format}`;
    const filepath = path.join(audioDir, filename);

    debug(`Saving ${format} audio to ${filepath} (${audioBuffer.length} bytes)`);

    await fs.writeFile(filepath, audioBuffer);

    const url = `http://localhost:${port}/audio-files/${filename}`;
    debug(`Audio saved, URL: ${url}`);

    return url;
  }

  /**
   * Get URL for a filename in audio directory
   * @param {string} filename - Name of audio file
   * @returns {string} Full URL
   */
  function getAudioUrl(filename) {
    return `http://localhost:${port}/audio-files/${filename}`;
  }

  /**
   * Finalize the Express app by adding 404 and error handlers
   * Call this AFTER adding any additional routes
   */
  function finalize() {
    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // Error handler
    app.use((err, _req, res, _next) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      });
    });

    debug('HTTP server finalized with 404/error handlers');
  }

  return {
    app,
    server,
    saveAudio,
    getAudioUrl,
    close: () => server.close(),
    finalize
  };
}

module.exports = {
  createHttpServer,
  cleanupOldFiles,
  CLEANUP_INTERVAL,
  FILE_MAX_AGE
};
