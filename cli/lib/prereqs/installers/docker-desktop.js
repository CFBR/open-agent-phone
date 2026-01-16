import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { execSync } from 'child_process';
import fs from 'fs';
import { runWithLogging } from '../utils/execute.js';

/**
 * Install or launch Docker Desktop on macOS
 * @param {object} _platform - Platform info from detectPlatform()
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
export async function installDockerDesktop(_platform) {
  console.log(chalk.bold.cyan('\n📦 Docker Desktop\n'));

  // Check if Docker Desktop is installed
  const installed = isDockerDesktopInstalled();

  if (installed) {
    // Docker Desktop is installed but not running
    return await launchDockerDesktop();
  } else {
    // Docker Desktop not installed - offer to install
    return await installDockerDesktopNew();
  }
}

/**
 * Check if Docker Desktop is installed
 * @returns {boolean} True if installed
 */
function isDockerDesktopInstalled() {
  return fs.existsSync('/Applications/Docker.app');
}

/**
 * Launch existing Docker Desktop installation
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
async function launchDockerDesktop() {
  console.log(chalk.yellow('Docker Desktop is installed but not running.\n'));

  const { launch } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'launch',
      message: 'Launch Docker Desktop?',
      default: true
    }
  ]);

  if (!launch) {
    console.log(chalk.gray('\nPlease launch Docker Desktop manually and run "claude-phone setup" again.\n'));
    return { success: false, cancelled: true };
  }

  // Launch Docker Desktop
  try {
    console.log(chalk.cyan('\nLaunching Docker Desktop...'));
    execSync('open -a Docker', { stdio: 'pipe' });

    // Wait for Docker daemon to start
    return await waitForDockerDaemon();
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to launch Docker Desktop: ${error.message}`));
    return { success: false };
  }
}

/**
 * Install Docker Desktop via Homebrew or manual download
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
async function installDockerDesktopNew() {
  console.log(chalk.yellow('Docker Desktop is not installed.\n'));

  // Check if Homebrew is available
  const hasHomebrew = checkHomebrew();

  if (hasHomebrew) {
    // Offer Homebrew installation
    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'How would you like to install Docker Desktop?',
        choices: [
          { name: 'Install via Homebrew (recommended)', value: 'brew' },
          { name: 'Manual download from docker.com', value: 'manual' },
          { name: 'Cancel', value: 'cancel' }
        ]
      }
    ]);

    if (method === 'cancel') {
      return { success: false, cancelled: true };
    }

    if (method === 'brew') {
      return await installViaHomebrew();
    } else {
      return await installManually();
    }
  } else {
    // No Homebrew - only manual option
    return await installManually();
  }
}

/**
 * Install Docker Desktop via Homebrew
 * @returns {Promise<{success: boolean}>}
 */
async function installViaHomebrew() {
  try {
    console.log(chalk.cyan('\nInstalling Docker Desktop via Homebrew...'));
    console.log(chalk.gray('This may take several minutes...\n'));

    const result = await runWithLogging('brew install --cask docker');

    if (!result.success) {
      console.error(chalk.red('\n❌ Homebrew installation failed'));
      return { success: false };
    }

    console.log(chalk.green('\n✓ Docker Desktop installed'));

    // Launch Docker Desktop
    const { launch } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'launch',
        message: 'Launch Docker Desktop now?',
        default: true
      }
    ]);

    if (!launch) {
      console.log(chalk.gray('\nPlease launch Docker Desktop manually and run "claude-phone setup" again.\n'));
      return { success: false, cancelled: true };
    }

    execSync('open -a Docker', { stdio: 'pipe' });

    return await waitForDockerDaemon();
  } catch (error) {
    console.error(chalk.red(`\n❌ Installation failed: ${error.message}`));
    return { success: false };
  }
}

/**
 * Guide user through manual Docker Desktop installation
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
async function installManually() {
  console.log(chalk.cyan('\n📥 Manual Installation\n'));
  console.log(chalk.gray('1. Download Docker Desktop from:'));
  console.log(chalk.cyan('   https://www.docker.com/products/docker-desktop/\n'));
  console.log(chalk.gray('2. Open the .dmg file and drag Docker to Applications'));
  console.log(chalk.gray('3. Launch Docker from Applications\n'));

  const { ready } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'ready',
      message: 'Press Enter when Docker Desktop is installed and running',
      default: true
    }
  ]);

  if (!ready) {
    return { success: false, cancelled: true };
  }

  // Wait for Docker daemon
  return await waitForDockerDaemon();
}

/**
 * Wait for Docker daemon to become available
 * @param {number} timeout - Timeout in milliseconds (default: 5 minutes)
 * @returns {Promise<{success: boolean}>}
 */
async function waitForDockerDaemon(timeout = 300000) {
  const spinner = ora('Waiting for Docker daemon...').start();
  const startTime = Date.now();
  const checkInterval = 5000; // Check every 5 seconds

  while (Date.now() - startTime < timeout) {
    // Check if Docker is running
    const running = await isDockerRunning();

    if (running) {
      spinner.succeed('Docker daemon ready!');
      return { success: true };
    }

    // Update spinner with elapsed time
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    spinner.text = `Waiting for Docker daemon... (${elapsed}s)`;

    // Wait before next check
    await sleep(checkInterval);
  }

  // Timeout
  spinner.fail('Timeout waiting for Docker daemon');
  console.log(chalk.yellow('\n⚠️  Docker Desktop is taking longer than expected to start.'));
  console.log(chalk.gray('Please check Docker Desktop and run "claude-phone setup" again.\n'));

  return { success: false };
}

/**
 * Check if Docker daemon is running
 * @returns {Promise<boolean>} True if running
 */
async function isDockerRunning() {
  try {
    execSync('docker ps', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if Homebrew is installed
 * @returns {boolean} True if Homebrew is available
 */
function checkHomebrew() {
  try {
    execSync('brew --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
