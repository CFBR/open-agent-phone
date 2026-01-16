import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Detect platform information (OS, distro, arch, package manager)
 * @returns {Promise<object>} Platform information object
 */
export async function detectPlatform() {
  const platform = os.platform(); // 'darwin', 'linux', 'win32'
  const arch = os.arch(); // 'x64', 'arm64', 'arm'

  // Normalize architecture names
  const normalizedArch = normalizeArch(arch);
  const isArm = ['arm64', 'armv7l'].includes(normalizedArch);

  let distro = null;
  let distroVersion = null;
  let packageManager = null;
  let isPi = false;

  if (platform === 'darwin') {
    // macOS
    distro = 'macos';
    packageManager = 'brew';
    distroVersion = await getMacOSVersion();
  } else if (platform === 'linux') {
    // Linux - detect distro from /etc/os-release
    const osRelease = parseOsRelease();
    distro = osRelease.id || 'unknown';
    distroVersion = osRelease.version_id || 'unknown';
    packageManager = detectPackageManager(distro);
    isPi = await isRaspberryPi();
  }

  return {
    os: platform,
    distro,
    distroVersion,
    arch: normalizedArch,
    packageManager,
    isArm,
    isPi
  };
}

/**
 * Normalize architecture names to consistent format
 * @param {string} arch - Raw arch from os.arch()
 * @returns {string} Normalized arch name
 */
function normalizeArch(arch) {
  const mapping = {
    'x64': 'x86_64',
    'x86_64': 'x86_64',
    'arm64': 'arm64',
    'aarch64': 'arm64',
    'arm': 'armv7l',
    'armv7l': 'armv7l'
  };

  return mapping[arch] || arch;
}

/**
 * Parse /etc/os-release file on Linux
 * @returns {object} Parsed key-value pairs from os-release
 */
function parseOsRelease() {
  try {
    const content = fs.readFileSync('/etc/os-release', 'utf-8');
    const lines = content.split('\n');
    const result = {};

    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        const key = match[1].toLowerCase();
        let value = match[2];

        // Remove quotes
        value = value.replace(/^"(.*)"$/, '$1');
        value = value.replace(/^'(.*)'$/, '$1');

        result[key] = value;
      }
    }

    return result;
  } catch (error) {
    return {};
  }
}

/**
 * Detect package manager based on distro
 * @param {string} distro - Distro ID from os-release
 * @returns {string} Package manager command (apt, dnf, yum, pacman, brew)
 */
function detectPackageManager(distro) {
  // Debian/Ubuntu family
  if (['ubuntu', 'debian', 'raspbian'].includes(distro)) {
    return 'apt';
  }

  // RHEL/Fedora family
  if (['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(distro)) {
    // Newer versions use dnf
    try {
      execSync('which dnf', { stdio: 'pipe' });
      return 'dnf';
    } catch (e) {
      return 'yum';
    }
  }

  // Arch family
  if (['arch', 'manjaro'].includes(distro)) {
    return 'pacman';
  }

  // Fallback - try to detect by checking which command exists
  const packageManagers = ['apt', 'dnf', 'yum', 'pacman'];
  for (const pm of packageManagers) {
    try {
      execSync(`which ${pm}`, { stdio: 'pipe' });
      return pm;
    } catch (e) {
      // Continue to next
    }
  }

  return 'unknown';
}

/**
 * Check if running on Raspberry Pi
 * @returns {Promise<boolean>} True if Raspberry Pi
 */
async function isRaspberryPi() {
  try {
    // Check device tree model file
    const modelPath = '/sys/firmware/devicetree/base/model';
    if (fs.existsSync(modelPath)) {
      const model = fs.readFileSync(modelPath, 'utf-8').toLowerCase();
      return model.includes('raspberry pi');
    }

    // Fallback: Check /proc/cpuinfo
    if (fs.existsSync('/proc/cpuinfo')) {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf-8').toLowerCase();
      return cpuinfo.includes('raspberry pi');
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get macOS version
 * @returns {Promise<string>} macOS version string
 */
async function getMacOSVersion() {
  try {
    const output = execSync('sw_vers -productVersion', {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return output.trim();
  } catch (error) {
    return 'unknown';
  }
}
