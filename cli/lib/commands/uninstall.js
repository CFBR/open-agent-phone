import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getConfigDir, configExists } from '../config.js';
import { stopContainers } from '../docker.js';
import { stopServer, isServerRunning } from '../process-manager.js';

/**
 * Get the CLI install directory path
 * @returns {string} Path to ~/.claude-phone-cli
 */
function getCliInstallDir() {
  return path.join(os.homedir(), '.claude-phone-cli');
}

/**
 * Find symlink location
 * @returns {Promise<string|null>} Symlink path or null if not found
 */
async function findSymlink() {
  const possiblePaths = [
    '/usr/local/bin/claude-phone',
    path.join(os.homedir(), '.local/bin/claude-phone')
  ];

  for (const symlinkPath of possiblePaths) {
    try {
      const stats = await fs.promises.lstat(symlinkPath);
      if (stats.isSymbolicLink()) {
        return symlinkPath;
      }
    } catch (error) {
      // Path doesn't exist, continue
    }
  }

  return null;
}

/**
 * Remove directory recursively
 * @param {string} dirPath - Directory path to remove
 * @returns {Promise<void>}
 */
async function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  }
}

/**
 * Uninstall command - Complete removal of Claude Phone
 * @returns {Promise<void>}
 */
export async function uninstallCommand() {
  console.log(chalk.bold.red('\n🗑️  Uninstall Claude Phone\n'));

  const configDir = getConfigDir();
  const cliDir = getCliInstallDir();
  const hasConfig = configExists();
  const symlinkPath = await findSymlink();

  // Show what will be removed
  console.log(chalk.bold('The following will be removed:\n'));

  if (hasConfig || fs.existsSync(configDir)) {
    console.log(chalk.yellow('  • Configuration directory:'));
    console.log(chalk.gray(`    ${configDir}`));
    console.log(chalk.gray('    (includes config.json, backups, generated files)'));
  }

  if (fs.existsSync(cliDir)) {
    console.log(chalk.yellow('\n  • CLI installation:'));
    console.log(chalk.gray(`    ${cliDir}`));
  }

  if (symlinkPath) {
    console.log(chalk.yellow('\n  • Symlink:'));
    console.log(chalk.gray(`    ${symlinkPath}`));
  }

  console.log(chalk.yellow('\n  • Docker containers:'));
  console.log(chalk.gray('    voice-app, drachtio, freeswitch'));

  // First confirmation: Remove Claude Phone?
  console.log(chalk.bold.red('\n⚠️  WARNING: This action cannot be undone!\n'));

  const { confirmUninstall } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmUninstall',
      message: 'Remove Claude Phone?',
      default: false
    }
  ]);

  if (!confirmUninstall) {
    console.log(chalk.gray('\nUninstall cancelled.\n'));
    return;
  }

  // Second confirmation: Delete configuration and backups?
  if (hasConfig || fs.existsSync(configDir)) {
    const { confirmConfig } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmConfig',
        message: 'Delete configuration and backups? (This will remove API keys and all backups)',
        default: false
      }
    ]);

    if (!confirmConfig) {
      console.log(chalk.gray('\nUninstall cancelled. Configuration preserved.\n'));
      return;
    }
  }

  console.log(chalk.bold.cyan('\n🧹 Removing Claude Phone...\n'));

  // Step 1: Stop services
  let spinner = ora('Stopping Claude API server...').start();
  try {
    if (await isServerRunning()) {
      await stopServer();
      spinner.succeed('Claude API server stopped');
    } else {
      spinner.info('Claude API server not running');
    }
  } catch (error) {
    spinner.warn(`Could not stop server: ${error.message}`);
  }

  spinner = ora('Stopping Docker containers...').start();
  try {
    await stopContainers();
    spinner.succeed('Docker containers stopped');
  } catch (error) {
    spinner.warn(`Could not stop containers: ${error.message}`);
  }

  // Step 2: Remove configuration directory
  if (fs.existsSync(configDir)) {
    spinner = ora('Removing configuration directory...').start();
    try {
      await removeDirectory(configDir);
      spinner.succeed('Configuration directory removed');
    } catch (error) {
      spinner.fail(`Failed to remove config directory: ${error.message}`);
    }
  }

  // Step 3: Remove CLI installation
  if (fs.existsSync(cliDir)) {
    spinner = ora('Removing CLI installation...').start();
    try {
      await removeDirectory(cliDir);
      spinner.succeed('CLI installation removed');
    } catch (error) {
      spinner.fail(`Failed to remove CLI directory: ${error.message}`);
    }
  }

  // Step 4: Remove symlink
  if (symlinkPath) {
    spinner = ora('Removing symlink...').start();
    try {
      await fs.promises.unlink(symlinkPath);
      spinner.succeed('Symlink removed');
    } catch (error) {
      spinner.warn(`Could not remove symlink: ${error.message}`);
    }
  }

  console.log(chalk.bold.green('\n✓ Claude Phone uninstalled\n'));
  console.log(chalk.gray('Thank you for using Claude Phone! 👋\n'));
  console.log(chalk.gray('Note: Docker images were not removed. To clean them up, run:'));
  console.log(chalk.gray('  docker image rm drachtio/drachtio-server:latest'));
  console.log(chalk.gray('  docker image rm drachtio/drachtio-freeswitch-mrf:latest\n'));
}
