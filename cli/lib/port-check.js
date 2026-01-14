import net from 'net';
import dgram from 'dgram';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a TCP port is in use
 * @param {number} port - Port number to check
 * @param {number} [timeout=1000] - Timeout in milliseconds
 * @returns {Promise<object>} Port check result
 * @property {number} port - Port that was checked
 * @property {boolean} inUse - True if port is in use
 */
export async function checkPort(port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    // Set timeout
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        port: port,
        inUse: false
      });
    }, timeout);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({
        port: port,
        inUse: true
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();

      // ECONNREFUSED means nothing is listening on the port
      // EACCES means permission denied (port is in use but we can't connect)
      // EADDRINUSE means the port is in use
      if (err.code === 'ECONNREFUSED') {
        resolve({
          port: port,
          inUse: false
        });
      } else if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
        resolve({
          port: port,
          inUse: true
        });
      } else {
        // Unknown error, assume port is not available
        resolve({
          port: port,
          inUse: false,
          error: err.message
        });
      }
    });

    // Try to connect to the port
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Check if a UDP port is in use by trying to bind to it
 * @param {number} port - Port number to check
 * @param {number} [timeout=1000] - Timeout in milliseconds
 * @returns {Promise<boolean>} True if port is in use
 */
export async function checkUdpPort(port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');

    const timer = setTimeout(() => {
      socket.close();
      resolve(false);
    }, timeout);

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.close();
      // EADDRINUSE means port is in use
      resolve(err.code === 'EADDRINUSE' || err.code === 'EACCES');
    });

    socket.bind(port, '0.0.0.0', () => {
      // Successfully bound = port was free
      clearTimeout(timer);
      socket.close();
      resolve(false);
    });
  });
}

/**
 * Check if 3CX SBC process is running
 * @returns {Promise<boolean>} True if 3cxsbc process is running
 */
export async function check3cxSbcProcess() {
  try {
    const { stdout } = await execAsync('pgrep -x 3cxsbc || systemctl is-active 3cxsbc 2>/dev/null');
    return stdout.trim().length > 0 || stdout.includes('active');
  } catch {
    return false;
  }
}

/**
 * Detect if 3CX SBC is running
 * Checks: 1) 3cxsbc process, 2) UDP port 5060, 3) TCP port 5060
 * @returns {Promise<boolean>} True if 3CX SBC detected
 */
export async function detect3cxSbc() {
  // Check for 3cxsbc process first (most reliable)
  const processRunning = await check3cxSbcProcess();
  if (processRunning) {
    return true;
  }

  // Check UDP port 5060 (SIP typically uses UDP)
  const udpInUse = await checkUdpPort(5060);
  if (udpInUse) {
    return true;
  }

  // Fall back to TCP check
  const tcpResult = await checkPort(5060);
  return tcpResult.inUse;
}
