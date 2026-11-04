/**
 * Webhook URL safety checks.
 *
 * Reject credentials, non-HTTP schemes, localhost, and private literal
 * addresses. `assertSafeWebhookUrl` also resolves hostnames and rejects any
 * result that points at a private address, so a DNS name cannot bypass the
 * literal checks.
 */

const dns = require('node:dns').promises;
const net = require('node:net');

function normalizeHost(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function isPrivateIp(address) {
  if (!net.isIP(address)) return false;

  if (address.includes(':')) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
    return false;
  }

  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  return false;
}

function isPrivateHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === 'localhost' || host === 'localhost.localdomain' || host.endsWith('.localhost')) {
    return true;
  }
  return isPrivateIp(host);
}

/**
 * Synchronous URL validation for request handlers.
 * @param {string} raw
 * @param {Object} [options]
 * @param {boolean} [options.allowPrivate=false]
 * @returns {{ok: boolean, url?: URL, error?: string}}
 */
function validateWebhookUrl(raw, { allowPrivate = false } = {}) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'webhookUrl must be a non-empty string' };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'webhookUrl must be a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'webhookUrl must use http or https' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'webhookUrl must not include credentials' };
  }
  if (!allowPrivate && isPrivateHostname(parsed.hostname)) {
    return { ok: false, error: 'webhookUrl must not target a private address' };
  }

  return { ok: true, url: parsed };
}

/**
 * Async validation that also resolves hostnames.
 * @param {string} raw
 * @param {Object} [options]
 * @param {boolean} [options.allowPrivate=false]
 * @param {Function} [options.lookup]
 * @returns {Promise<{ok: boolean, url?: URL, error?: string}>}
 */
async function assertSafeWebhookUrl(raw, {
  allowPrivate = false,
  lookup = dns.lookup,
} = {}) {
  const validation = validateWebhookUrl(raw, { allowPrivate });
  if (!validation.ok || allowPrivate) return validation;

  const host = normalizeHost(validation.url.hostname);
  if (net.isIP(host)) return validation;

  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch (error) {
    return { ok: false, error: `webhook host could not be resolved: ${error.message}` };
  }

  const results = Array.isArray(addresses) ? addresses : [addresses];
  for (const entry of results) {
    const address = typeof entry === 'string' ? entry : entry.address;
    if (isPrivateIp(address)) {
      return { ok: false, error: `webhook host resolves to a private address (${address})` };
    }
  }

  return validation;
}

module.exports = {
  normalizeHost,
  isPrivateIp,
  isPrivateHostname,
  validateWebhookUrl,
  assertSafeWebhookUrl,
};
