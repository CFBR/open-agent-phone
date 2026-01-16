import chalk from 'chalk';
import { loadConfig, configExists, getInstallationType } from '../config.js';
import { getContainerStatus } from '../docker.js';
import { isServerRunning, getServerPid } from '../process-manager.js';
import { checkClaudeApiServer } from '../network.js';

/**
 * Status command - Show service status
 * @returns {Promise<void>}
 */
export async function statusCommand() {
  console.log(chalk.bold.cyan('\n📊 Claude Phone Status\n'));

  // Check if configured
  if (!configExists()) {
    console.log(chalk.red('✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    return;
  }

  const config = await loadConfig();
  const installationType = getInstallationType(config);
  const isPiSplit = config.deployment && config.deployment.mode === 'pi-split';

  // Show installation type
  console.log(chalk.bold('Installation Type:'));
  console.log(chalk.gray(`  ${installationType === 'api-server' ? 'API Server' : installationType === 'voice-server' ? 'Voice Server' : 'Both (all-in-one)'}`));
  console.log();

  // Show type-appropriate status
  if (installationType === 'api-server' || installationType === 'both') {
    await showApiServerStatus(config, isPiSplit);
  }

  if (installationType === 'voice-server' || installationType === 'both') {
    await showVoiceServerStatus(config, isPiSplit, installationType);
  }

  console.log();
}

/**
 * Show API server status
 * @param {object} config - Configuration
 * @param {boolean} isPiSplit - Is Pi split mode
 * @returns {Promise<void>}
 */
async function showApiServerStatus(config, isPiSplit) {
  console.log(chalk.bold('Claude API Server:'));

  if (isPiSplit) {
    // Pi-split mode: Check remote API server
    const apiUrl = `http://${config.deployment.pi.macIp}:${config.server.claudeApiPort}`;
    const apiHealth = await checkClaudeApiServer(apiUrl);

    if (apiHealth.healthy) {
      console.log(chalk.green(`  ✓ Connected to API server (${config.deployment.pi.macIp}:${config.server.claudeApiPort})`));
      console.log(chalk.gray('    Remote API server is healthy'));
    } else {
      console.log(chalk.red(`  ✗ Cannot reach API server`));
      console.log(chalk.gray(`    Tried: ${apiUrl}`));
      console.log(chalk.gray('    Run "claude-phone api-server" on your API server'));
    }
  } else {
    // Standard mode: Check local server
    const serverRunning = await isServerRunning();
    if (serverRunning) {
      const pid = getServerPid();
      console.log(chalk.green(`  ✓ Running (PID: ${pid})`));
      console.log(chalk.gray(`    Port: ${config.server.claudeApiPort}`));
    } else {
      console.log(chalk.red('  ✗ Not running'));
    }
  }
  console.log();
}

/**
 * Show voice server status
 * @param {object} config - Configuration
 * @param {boolean} isPiSplit - Is Pi split mode
 * @param {string} installationType - Installation type
 * @returns {Promise<void>}
 */
async function showVoiceServerStatus(config, isPiSplit, installationType) {
  // Docker Containers
  console.log(chalk.bold('Docker Containers:'));
  const containers = await getContainerStatus();

  if (containers.length === 0) {
    console.log(chalk.red('  ✗ No containers running'));
  } else {
    for (const container of containers) {
      const isRunning = container.status.toLowerCase().includes('up') ||
                        container.status.toLowerCase().includes('running');
      const icon = isRunning ? '✓' : '✗';
      const color = isRunning ? chalk.green : chalk.red;
      console.log(color(`  ${icon} ${container.name}: ${container.status}`));
    }
  }
  console.log();

  // Devices
  console.log(chalk.bold('Configured Devices:'));
  if (config.devices && config.devices.length > 0) {
    for (const device of config.devices) {
      console.log(chalk.gray(`  • ${device.name} (extension ${device.extension})`));
    }
  } else {
    console.log(chalk.gray('  (none configured)'));
  }
  console.log();

  // Network
  console.log(chalk.bold('Network:'));
  if (isPiSplit) {
    console.log(chalk.gray(`  Deployment Mode: Pi Split`));
    console.log(chalk.gray(`  Pi IP: ${config.server.externalIp}`));
    console.log(chalk.gray(`  API Server IP: ${config.deployment.pi.macIp}`));
    console.log(chalk.gray(`  Drachtio Port: ${config.deployment.pi.drachtioPort}`));
    if (config.deployment.pi.has3cxSbc) {
      console.log(chalk.yellow('  3CX SBC detected (using port 5070)'));
    }
  } else if (installationType === 'voice-server') {
    console.log(chalk.gray(`  Deployment Mode: Voice Server`));
    console.log(chalk.gray(`  Server IP: ${config.server.externalIp}`));
    if (config.deployment.apiServerIp) {
      console.log(chalk.gray(`  API Server IP: ${config.deployment.apiServerIp}`));
    }
  } else {
    console.log(chalk.gray(`  Deployment Mode: Both (all-in-one)`));
    console.log(chalk.gray(`  External IP: ${config.server.externalIp}`));
  }

  if (config.sip) {
    console.log(chalk.gray(`  SIP Domain: ${config.sip.domain}`));
    console.log(chalk.gray(`  SIP Registrar: ${config.sip.registrar}`));
  }
}
