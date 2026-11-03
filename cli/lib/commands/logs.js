import chalk from 'chalk';
import { spawn } from 'child_process';
import { loadConfig, configExists, getDockerComposePath, getPidPath } from '../config.js';
import { getApiServerLogPath } from '../process-manager.js';
import fs from 'fs';

/**
 * Logs command - Tail service logs
 * @param {string} [service] - Optional service name (voice-app or api-server)
 * @returns {Promise<void>}
 */
export async function logsCommand(service = null) {
  if (!configExists()) {
    console.log(chalk.red('\n✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  const config = await loadConfig();
  const dockerComposePath = getDockerComposePath();

  // Validate service argument
  const validServices = ['voice-app', 'drachtio', 'freeswitch', 'api-server'];
  if (service && !validServices.includes(service)) {
    console.log(chalk.red(`\n✗ Invalid service: ${service}`));
    console.log(chalk.gray('  Valid services: voice-app, drachtio, freeswitch, api-server'));
    console.log(chalk.gray('  Or omit service to tail all logs\n'));
    process.exit(1);
  }

  // Header
  if (service) {
    console.log(chalk.bold.cyan(`\n📋 Tailing logs for ${service}...\n`));
  } else {
    console.log(chalk.bold.cyan('\n📋 Tailing all service logs...\n'));
  }

  // Handle different service options
  if (!service || service === 'voice-app' || service === 'drachtio' || service === 'freeswitch') {
    // Docker container logs
    if (!fs.existsSync(dockerComposePath)) {
      console.log(chalk.yellow('⚠ Docker containers not configured'));
      console.log(chalk.gray('  Run "claude-phone start" first\n'));
      if (service) {
        process.exit(1);
      }
    } else if (!service) {
      // Both services - interleave logs
      tailBothServices(dockerComposePath, config);
      return;
    } else {
      // A specific Docker service
      tailDockerLogs(dockerComposePath, service);
      return;
    }
  }

  if (!service || service === 'api-server') {
    // API server logs
    const pidPath = getPidPath();
    if (!fs.existsSync(pidPath)) {
      console.log(chalk.yellow('⚠ Claude API server not running'));
      console.log(chalk.gray('  Run "claude-phone start" first\n'));
      if (service === 'api-server') {
        process.exit(1);
      }
    } else if (service === 'api-server') {
      tailAPIServerLogs(config);
      return;
    }
  }
}

/**
 * Tail Docker container logs
 * @param {string} dockerComposePath - Path to docker-compose.yml
 * @param {string} [service] - Optional service name
 */
function tailDockerLogs(dockerComposePath, service = null) {
  const args = [
    'compose',
    '-f',
    dockerComposePath,
    'logs',
    '-f',
    '--tail=50'
  ];
  if (service) args.push(service);

  const child = spawn('docker', args, {
    stdio: 'inherit'
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    child.kill('SIGTERM');
    console.log(chalk.gray('\n\nStopped tailing logs.\n'));
    process.exit(0);
  });

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n✗ Docker logs failed with exit code ${code}\n`));
      process.exit(code);
    }
  });
}

/**
 * Tail API server logs
 * @param {object} config - Configuration object
 */
function tailAPIServerLogs(_config) {
  const logPath = getApiServerLogPath();

  if (!fs.existsSync(logPath)) {
    console.log(chalk.yellow('Note: API server log file not found'));
    console.log(chalk.gray(`  Expected at: ${logPath}`));
    console.log(chalk.gray('  Start the API server with "claude-phone start" to create it.\n'));
    process.exit(1);
  }

  console.log(chalk.gray(`Tailing ${logPath}\n`));

  const child = spawn('tail', ['-f', '-n', '50', logPath], {
    stdio: 'inherit'
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    child.kill('SIGTERM');
    console.log(chalk.gray('\n\nStopped tailing API server logs.\n'));
    process.exit(0);
  });

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n✗ Log tail failed with exit code ${code}\n`));
      process.exit(code);
    }
  });
}

/**
 * Tail both services with interleaved output
 * @param {string} dockerComposePath - Path to docker-compose.yml
 * @param {object} _config - Configuration object (unused)
 */
function tailBothServices(dockerComposePath, _config) {
  console.log(chalk.gray('Showing Docker container logs (API server logs: claude-phone logs api-server)\n'));

  const child = spawn('docker', [
    'compose',
    '-f',
    dockerComposePath,
    'logs',
    '-f',
    '--tail=50'
  ], {
    stdio: 'inherit'
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    child.kill('SIGTERM');
    console.log(chalk.gray('\n\nStopped tailing logs.\n'));
    process.exit(0);
  });

  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n✗ Docker logs failed with exit code ${code}\n`));
      process.exit(code);
    }
  });
}
