import { execSync } from 'child_process';

/**
 * Check Node.js version
 * @param {object} _platform - Platform info from detectPlatform()
 * @returns {Promise<object>} Check result
 */
export async function checkNode(_platform) {
  const requiredVersion = '18.0.0';

  try {
    // Run node --version
    const output = execSync('node --version', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const version = parseNodeVersion(output.trim());

    if (!version) {
      return {
        name: 'Node.js',
        passed: false,
        version: null,
        required: `>=${requiredVersion}`,
        message: 'Node.js version could not be determined',
        canAutoFix: true
      };
    }

    const passed = compareVersions(version, requiredVersion) >= 0;

    return {
      name: 'Node.js',
      passed,
      version,
      required: `>=${requiredVersion}`,
      message: passed
        ? `Node.js v${version} (requires >=${requiredVersion})`
        : `Node.js v${version} (requires >=${requiredVersion})`,
      canAutoFix: !passed
    };
  } catch (error) {
    // Node not found
    return {
      name: 'Node.js',
      passed: false,
      version: null,
      required: `>=${requiredVersion}`,
      message: 'Node.js not installed',
      canAutoFix: true,
      error: 'command_not_found'
    };
  }
}

/**
 * Parse Node.js version string (handles v20.11.0 or 20.11.0 format)
 * @param {string} versionString - Raw version output
 * @returns {string|null} Parsed version (e.g., "20.11.0")
 */
function parseNodeVersion(versionString) {
  // Remove leading 'v' if present
  const cleaned = versionString.replace(/^v/, '');

  // Match semantic version pattern (major.minor.patch)
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  return null;
}

/**
 * Compare two semantic versions
 * @param {string} version1 - First version (e.g., "20.11.0")
 * @param {string} version2 - Second version (e.g., "18.0.0")
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const v1 = v1parts[i] || 0;
    const v2 = v2parts[i] || 0;

    if (v1 > v2) return 1;
    if (v1 < v2) return -1;
  }

  return 0;
}
