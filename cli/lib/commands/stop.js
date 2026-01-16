import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, configExists, getInstallationType } from '../config.js';
import { stopContainers } from '../docker.js';
import { stopServer, isServerRunning } from '../process-manager.js';

/**
 * Stop command - Shut down all services
 * @returns {Promise<void>}
 */
export async function stopCommand() {
  console.log(chalk.bold.cyan('\n⏹️  Stopping Claude Phone\n'));

  // Check if configured
  if (!configExists()) {
    console.log(chalk.yellow('⚠️  Not configured. Nothing to stop.\n'));
    return;
  }

  // Load config and get installation type
  const config = await loadConfig();
  const installationType = getInstallationType(config);

  console.log(chalk.gray(`Installation type: ${installationType}\n`));

  // Route to type-specific stop function
  switch (installationType) {
    case 'api-server':
      await stopApiServer();
      break;
    case 'voice-server':
      await stopVoiceServer();
      break;
    case 'both':
    default:
      await stopBoth();
      break;
  }

  console.log(chalk.bold.green('\n✓ Services stopped\n'));
}

/**
 * Stop API server only
 * @returns {Promise<void>}
 */
async function stopApiServer() {
  const spinner = ora('Stopping Claude API server...').start();
  try {
    if (await isServerRunning()) {
      await stopServer();
      spinner.succeed('Claude API server stopped');
    } else {
      spinner.info('Claude API server not running');
    }
  } catch (error) {
    spinner.fail(`Failed to stop server: ${error.message}`);
  }
}

/**
 * Stop voice server only
 * @returns {Promise<void>}
 */
async function stopVoiceServer() {
  const spinner = ora('Stopping Docker containers...').start();
  try {
    await stopContainers();
    spinner.succeed('Docker containers stopped');
  } catch (error) {
    spinner.fail(`Failed to stop containers: ${error.message}`);
  }
}

/**
 * Stop both API server and voice server
 * @returns {Promise<void>}
 */
async function stopBoth() {
  // Stop claude-api-server
  const spinner = ora('Stopping Claude API server...').start();
  try {
    if (await isServerRunning()) {
      await stopServer();
      spinner.succeed('Claude API server stopped');
    } else {
      spinner.info('Claude API server not running');
    }
  } catch (error) {
    spinner.fail(`Failed to stop server: ${error.message}`);
  }

  // Stop Docker containers
  spinner.start('Stopping Docker containers...');
  try {
    await stopContainers();
    spinner.succeed('Docker containers stopped');
  } catch (error) {
    spinner.fail(`Failed to stop containers: ${error.message}`);
  }
}
