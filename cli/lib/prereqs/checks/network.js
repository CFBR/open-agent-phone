import axios from 'axios';

/**
 * Check network connectivity to required hosts
 * @param {object} _platform - Platform info from detectPlatform()
 * @returns {Promise<object>} Check result
 */
export async function checkNetwork(_platform) {
  const hosts = [
    { name: 'npm', url: 'https://registry.npmjs.org' },
    { name: 'docker', url: 'https://hub.docker.com' },
    { name: 'nodesource', url: 'https://deb.nodesource.com' }
  ];

  const timeout = 5000; // 5 seconds per host
  const results = {};

  // Check each host
  for (const host of hosts) {
    results[host.name] = await checkHost(host.url, timeout);
  }

  // Determine if we have enough connectivity
  const reachable = Object.values(results).filter(r => r).length;
  const total = hosts.length;

  // We need at least npm to be reachable for auto-fix
  const npmReachable = results.npm;

  return {
    name: 'Network',
    passed: true, // Network check is informational, not a hard requirement
    reachable,
    total,
    details: results,
    message: formatNetworkMessage(results),
    canAutoFix: false,
    autoFixDisabled: !npmReachable // Disable auto-fix if npm is unreachable
  };
}

/**
 * Check if a specific host is reachable
 * @param {string} url - URL to check
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if reachable
 */
async function checkHost(url, timeout) {
  try {
    const response = await axios.head(url, {
      timeout,
      validateStatus: (status) => status < 500 // Accept redirects, etc.
    });

    return response.status < 500;
  } catch (error) {
    // Timeout or network error
    return false;
  }
}

/**
 * Format network check message
 * @param {object} results - Results object with host statuses
 * @returns {string} Formatted message
 */
function formatNetworkMessage(results) {
  const parts = [];

  parts.push('Network:');

  for (const [name, reachable] of Object.entries(results)) {
    const symbol = reachable ? '✓' : '✗';
    parts.push(`${symbol} ${name}`);
  }

  return parts.join(' ');
}
