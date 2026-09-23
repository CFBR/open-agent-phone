/**
 * Audio file cleanup (dependency-free).
 *
 * Extracted from http-server.js so it can be unit-tested and reused without
 * pulling in express. Removes generated TTS files and uploaded audio files
 * older than a max age from a directory.
 */

const fs = require('fs').promises;
const path = require('path');

// Cleanup interval: every 2 minutes
const CLEANUP_INTERVAL = 120000;
// File max age: 10 minutes
const FILE_MAX_AGE = 600000;

/**
 * Cleanup files older than maxAge in a directory.
 * @param {string} directory - Directory to clean
 * @param {number} maxAge - Max age in milliseconds
 */
async function cleanupOldFiles(directory, maxAge) {
  try {
    const files = await fs.readdir(directory);
    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      const filepath = path.join(directory, file);

      try {
        const stats = await fs.stat(filepath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          await fs.unlink(filepath);
          deletedCount++;
        }
      } catch (error) {
        // Skip files that can't be accessed (already removed, or not a file)
      }
    }

    return deletedCount;
  } catch (error) {
    // Directory missing or unreadable — nothing to clean.
    return 0;
  }
}

module.exports = {
  cleanupOldFiles,
  CLEANUP_INTERVAL,
  FILE_MAX_AGE,
};
