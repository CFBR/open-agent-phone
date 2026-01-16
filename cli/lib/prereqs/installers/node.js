import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import os from 'os';
import { downloadFile, showPreview, runWithLogging } from '../utils/execute.js';
import { withSudo } from '../utils/sudo.js';
import { checkNode } from '../checks/node.js';

/**
 * Install Node.js based on platform
 * @param {object} platform - Platform info from detectPlatform()
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
export async function installNode(platform) {
  console.log(chalk.bold.cyan('\n📦 Node.js Installation\n'));

  // Confirm installation
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Install Node.js 20 LTS automatically?',
      default: false
    }
  ]);

  if (!confirmed) {
    showNodeManualInstructions(platform);
    return { success: false, cancelled: true };
  }

  // Route to platform-specific installer
  let result;

  switch (platform.packageManager) {
    case 'apt':
      result = await installNodeApt();
      break;
    case 'dnf':
    case 'yum':
      result = await installNodeDnf(platform.packageManager);
      break;
    case 'pacman':
      result = await installNodePacman();
      break;
    case 'brew':
      result = await installNodeBrew();
      break;
    default:
      console.error(chalk.red(`\n❌ Unsupported package manager: ${platform.packageManager}`));
      showNodeManualInstructions(platform);
      return { success: false };
  }

  if (!result.success) {
    return result;
  }

  // Verify installation
  console.log(chalk.cyan('\n✓ Verifying Node.js installation...'));
  const check = await checkNode(platform);

  if (check.passed) {
    console.log(chalk.green(`✓ Node.js v${check.version} installed successfully\n`));
    return { success: true };
  } else {
    console.error(chalk.red('\n❌ Node.js installation verification failed'));
    console.log(chalk.yellow('Node.js was installed but version check failed.'));
    return { success: false };
  }
}

/**
 * Install Node.js on Ubuntu/Debian using NodeSource repository
 * @returns {Promise<{success: boolean}>}
 */
async function installNodeApt() {
  const scriptUrl = 'https://deb.nodesource.com/setup_20.x';
  const tempFile = path.join(os.tmpdir(), `nodesource_setup_${Date.now()}.sh`);

  try {
    // Download script
    console.log(chalk.cyan('\nDownloading NodeSource setup script...'));
    await downloadFile(scriptUrl, tempFile);

    // Show preview
    await showPreview(tempFile);

    // Confirm execution
    const { executeConfirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'executeConfirmed',
        message: 'Run NodeSource setup script as root?',
        default: false
      }
    ]);

    if (!executeConfirmed) {
      return { success: false, cancelled: true };
    }

    // Run with sudo
    const commands = [
      `bash ${tempFile}`,
      'apt-get update',
      'apt-get install -y nodejs'
    ];

    const result = await withSudo(commands);

    // Clean up temp file
    try {
      const fs = await import('fs');
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (error) {
    console.error(chalk.red(`\n❌ Installation failed: ${error.message}`));
    return { success: false, error: error.message };
  }
}

/**
 * Install Node.js on RHEL/Fedora using NodeSource repository
 * @param {string} packageManager - 'dnf' or 'yum'
 * @returns {Promise<{success: boolean}>}
 */
async function installNodeDnf(packageManager) {
  const scriptUrl = 'https://rpm.nodesource.com/setup_20.x';
  const tempFile = path.join(os.tmpdir(), `nodesource_setup_${Date.now()}.sh`);

  try {
    // Download script
    console.log(chalk.cyan('\nDownloading NodeSource setup script...'));
    await downloadFile(scriptUrl, tempFile);

    // Show preview
    await showPreview(tempFile);

    // Confirm execution
    const { executeConfirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'executeConfirmed',
        message: 'Run NodeSource setup script as root?',
        default: false
      }
    ]);

    if (!executeConfirmed) {
      return { success: false, cancelled: true };
    }

    // Run with sudo
    const commands = [
      `bash ${tempFile}`,
      `${packageManager} install -y nodejs`
    ];

    const result = await withSudo(commands);

    // Clean up temp file
    try {
      const fs = await import('fs');
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    return result;
  } catch (error) {
    console.error(chalk.red(`\n❌ Installation failed: ${error.message}`));
    return { success: false, error: error.message };
  }
}

/**
 * Install Node.js on Arch Linux using pacman
 * @returns {Promise<{success: boolean}>}
 */
async function installNodePacman() {
  const commands = ['pacman -Sy --noconfirm nodejs npm'];

  console.log(chalk.cyan('\nInstalling Node.js via pacman...'));

  return await withSudo(commands);
}

/**
 * Install Node.js on macOS using Homebrew
 * @returns {Promise<{success: boolean}>}
 */
async function installNodeBrew() {
  try {
    console.log(chalk.cyan('\nInstalling Node.js 20 via Homebrew...'));
    console.log(chalk.gray('This may take several minutes...\n'));

    const result = await runWithLogging('brew install node@20');

    if (result.success) {
      // Link node@20
      console.log(chalk.cyan('\nLinking Node.js 20...'));
      await runWithLogging('brew link node@20');
    }

    return result;
  } catch (error) {
    console.error(chalk.red(`\n❌ Installation failed: ${error.message}`));
    return { success: false, error: error.message };
  }
}

/**
 * Show manual installation instructions for Node.js
 * @param {object} platform - Platform info
 * @returns {void}
 */
function showNodeManualInstructions(platform) {
  console.log(chalk.yellow('\n📋 Manual Node.js Installation\n'));

  switch (platform.packageManager) {
    case 'apt':
      console.log(chalk.gray('For Ubuntu/Debian:\n'));
      console.log(chalk.cyan('  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -'));
      console.log(chalk.cyan('  sudo apt-get install -y nodejs\n'));
      break;

    case 'dnf':
    case 'yum':
      console.log(chalk.gray('For RHEL/Fedora:\n'));
      console.log(chalk.cyan('  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -'));
      console.log(chalk.cyan(`  sudo ${platform.packageManager} install -y nodejs\n`));
      break;

    case 'pacman':
      console.log(chalk.gray('For Arch Linux:\n'));
      console.log(chalk.cyan('  sudo pacman -Sy nodejs npm\n'));
      break;

    case 'brew':
      console.log(chalk.gray('For macOS:\n'));
      console.log(chalk.cyan('  brew install node@20\n'));
      break;

    default:
      console.log(chalk.gray('Download from: https://nodejs.org/\n'));
  }

  console.log(chalk.gray('After installation, run "claude-phone setup" again.\n'));
}
