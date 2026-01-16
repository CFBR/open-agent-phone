import { execSync } from 'child_process';

/**
 * Check Docker installation and daemon status
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<object>} Check result
 */
export async function checkDocker(platform) {
  // First check if docker command exists
  const installed = checkDockerInstalled();

  if (!installed.success) {
    return {
      name: 'Docker',
      passed: false,
      version: null,
      required: '>=20.0.0',
      message: 'Docker not installed',
      canAutoFix: true,
      error: 'not_installed'
    };
  }

  // Check if daemon is running
  const running = checkDockerRunning();

  if (!running.success) {
    // Distinguish between permission denied and daemon not running
    if (running.error === 'permission_denied') {
      return {
        name: 'Docker',
        passed: false,
        version: installed.version,
        required: '>=20.0.0',
        message: 'Docker installed but permission denied (user not in docker group)',
        canAutoFix: true,
        error: 'permission_denied'
      };
    }

    // Docker Desktop on macOS might be installed but not running
    if (platform.os === 'darwin') {
      return {
        name: 'Docker',
        passed: false,
        version: installed.version,
        required: '>=20.0.0',
        message: 'Docker installed but daemon not running',
        canAutoFix: true,
        error: 'not_running'
      };
    }

    return {
      name: 'Docker',
      passed: false,
      version: installed.version,
      required: '>=20.0.0',
      message: 'Docker installed but daemon not running',
      canAutoFix: true,
      error: 'not_running'
    };
  }

  // Both installed and running - success
  return {
    name: 'Docker',
    passed: true,
    version: installed.version,
    required: '>=20.0.0',
    message: `Docker v${installed.version}`,
    canAutoFix: false
  };
}

/**
 * Check if docker command is installed
 * @returns {{success: boolean, version?: string}} Result with version if installed
 */
function checkDockerInstalled() {
  try {
    const output = execSync('docker --version', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const version = parseDockerVersion(output.trim());

    return {
      success: true,
      version: version || 'unknown'
    };
  } catch (error) {
    return {
      success: false
    };
  }
}

/**
 * Check if Docker daemon is running
 * @returns {{success: boolean, error?: string}} Result
 */
function checkDockerRunning() {
  try {
    execSync('docker ps', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    return { success: true };
  } catch (error) {
    // Check if it's a permission error
    if (error.stderr && error.stderr.includes('permission denied')) {
      return {
        success: false,
        error: 'permission_denied'
      };
    }

    // Check if it's daemon not running error
    if (
      error.stderr &&
      (error.stderr.includes('Cannot connect to the Docker daemon') ||
       error.stderr.includes('Is the docker daemon running?'))
    ) {
      return {
        success: false,
        error: 'not_running'
      };
    }

    // Unknown error
    return {
      success: false,
      error: 'unknown'
    };
  }
}

/**
 * Parse Docker version from output
 * @param {string} output - Docker version output
 * @returns {string|null} Parsed version (e.g., "24.0.7")
 */
function parseDockerVersion(output) {
  // Docker version 24.0.7, build afdd53b
  const match = output.match(/Docker version ([\d.]+)/);

  if (match) {
    return match[1];
  }

  return null;
}
