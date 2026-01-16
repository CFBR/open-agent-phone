import { execSync } from 'child_process';

/**
 * Check disk space availability
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<object>} Check result
 */
export async function checkDisk(platform) {
  const requiredGB = 2;
  const requiredBytes = requiredGB * 1024 * 1024 * 1024;

  try {
    const availableBytes = getDiskSpace(platform);

    if (availableBytes === null) {
      return {
        name: 'Disk Space',
        passed: false,
        available: null,
        required: `${requiredGB}GB`,
        message: 'Could not determine disk space',
        canAutoFix: false
      };
    }

    const availableGB = (availableBytes / (1024 * 1024 * 1024)).toFixed(1);
    const passed = availableBytes >= requiredBytes;

    return {
      name: 'Disk Space',
      passed,
      available: `${availableGB}GB`,
      required: `${requiredGB}GB`,
      message: passed
        ? `Disk space ${availableGB}GB free (requires >=${requiredGB}GB)`
        : `Disk space ${availableGB}GB free (requires >=${requiredGB}GB)`,
      canAutoFix: false
    };
  } catch (error) {
    return {
      name: 'Disk Space',
      passed: false,
      available: null,
      required: `${requiredGB}GB`,
      message: 'Error checking disk space',
      canAutoFix: false,
      error: error.message
    };
  }
}

/**
 * Get available disk space in bytes
 * @param {object} platform - Platform info
 * @returns {number|null} Available bytes or null on error
 */
function getDiskSpace(platform) {
  try {
    if (platform.os === 'darwin' || platform.os === 'linux') {
      // Use df command to get disk space
      const output = execSync('df -k /', {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // Parse output
      // Filesystem     1K-blocks    Used Available Use% Mounted on
      // /dev/disk1s1   245107200 89123456 147294848  38% /
      const lines = output.trim().split('\n');

      if (lines.length < 2) {
        return null;
      }

      const dataLine = lines[1];
      const parts = dataLine.split(/\s+/);

      // Available is typically the 4th column (index 3)
      if (parts.length >= 4) {
        const availableKB = parseInt(parts[3], 10);
        return availableKB * 1024; // Convert KB to bytes
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}
