import { execSync } from 'child_process';

/**
 * Check Docker Compose availability (plugin or standalone)
 * @param {object} _platform - Platform info from detectPlatform()
 * @returns {Promise<object>} Check result
 */
export async function checkCompose(_platform) {
  const requiredVersion = '1.29.0'; // Minimum for standalone
  const requiredPluginVersion = '2.0.0'; // Minimum for plugin

  // Try plugin first (preferred)
  const pluginResult = checkComposePlugin();

  if (pluginResult.success) {
    const passed = compareVersions(pluginResult.version, requiredPluginVersion) >= 0;

    return {
      name: 'Docker Compose',
      passed,
      version: pluginResult.version,
      variant: 'plugin',
      required: `>=${requiredPluginVersion}`,
      message: passed
        ? `Docker Compose v${pluginResult.version} (plugin)`
        : `Docker Compose v${pluginResult.version} (plugin, requires >=${requiredPluginVersion})`,
      canAutoFix: false // Usually comes with Docker installation
    };
  }

  // Fall back to standalone
  const standaloneResult = checkComposeStandalone();

  if (standaloneResult.success) {
    const passed = compareVersions(standaloneResult.version, requiredVersion) >= 0;

    return {
      name: 'Docker Compose',
      passed,
      version: standaloneResult.version,
      variant: 'standalone',
      required: `>=${requiredVersion}`,
      message: passed
        ? `Docker Compose v${standaloneResult.version} (standalone)`
        : `Docker Compose v${standaloneResult.version} (standalone, requires >=${requiredVersion})`,
      canAutoFix: false
    };
  }

  // Neither available
  return {
    name: 'Docker Compose',
    passed: false,
    version: null,
    variant: null,
    required: `>=${requiredPluginVersion}`,
    message: 'Docker Compose not available',
    canAutoFix: false // Usually installed with Docker
  };
}

/**
 * Check for docker compose plugin
 * @returns {{success: boolean, version?: string}} Result
 */
function checkComposePlugin() {
  try {
    const output = execSync('docker compose version', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const version = parseComposeVersion(output.trim());

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
 * Check for standalone docker-compose
 * @returns {{success: boolean, version?: string}} Result
 */
function checkComposeStandalone() {
  try {
    const output = execSync('docker-compose --version', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const version = parseComposeVersion(output.trim());

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
 * Parse Docker Compose version from output
 * @param {string} output - Version output
 * @returns {string|null} Parsed version (e.g., "2.21.0")
 */
function parseComposeVersion(output) {
  // Handle multiple formats:
  // Docker Compose version v2.21.0
  // docker-compose version 1.29.2, build 5becea4c
  const match = output.match(/version v?([\d.]+)/);

  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Compare two semantic versions
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
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
