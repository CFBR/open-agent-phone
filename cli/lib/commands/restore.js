import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getConfigPath, getConfigDir } from '../config.js';

/**
 * Get the backups directory path
 * @returns {string} Path to ~/.claude-phone/backups
 */
function getBackupsDir() {
  return path.join(getConfigDir(), 'backups');
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Parse timestamp from backup filename
 * @param {string} filename - Backup filename
 * @returns {Date|null} Parsed date or null
 */
function parseBackupTimestamp(filename) {
  // Extract timestamp from format: config.YYYY-MM-DD.HHmmss.json
  const match = filename.match(/config\.(\d{4}-\d{2}-\d{2})\.(\d{6})\.json/);
  if (!match) return null;

  const datePart = match[1];
  const timePart = match[2];

  // Parse: YYYY-MM-DD and HHmmss
  const year = datePart.substring(0, 4);
  const month = datePart.substring(5, 7);
  const day = datePart.substring(8, 10);
  const hour = timePart.substring(0, 2);
  const minute = timePart.substring(2, 4);
  const second = timePart.substring(4, 6);

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

/**
 * Format date in readable format
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Restore command - Restore configuration from backup
 * @returns {Promise<void>}
 */
export async function restoreCommand() {
  console.log(chalk.bold.cyan('\n🔄 Restore Configuration\n'));

  const backupsDir = getBackupsDir();

  // Check if backups directory exists
  if (!fs.existsSync(backupsDir)) {
    console.log(chalk.yellow('⚠️  No backups directory found.'));
    console.log(chalk.gray('Create a backup first with: claude-phone backup\n'));
    return;
  }

  // List available backups
  const files = await fs.promises.readdir(backupsDir);
  const backups = files.filter(f => f.startsWith('config.') && f.endsWith('.json'));

  if (backups.length === 0) {
    console.log(chalk.yellow('⚠️  No backups found.'));
    console.log(chalk.gray('Create a backup first with: claude-phone backup\n'));
    return;
  }

  // Sort backups by timestamp (newest first)
  backups.sort().reverse();

  // Get backup details
  const backupChoices = await Promise.all(
    backups.map(async (filename) => {
      const filepath = path.join(backupsDir, filename);
      const stats = await fs.promises.stat(filepath);
      const date = parseBackupTimestamp(filename);
      const dateStr = date ? formatDate(date) : 'Unknown date';
      const size = formatSize(stats.size);

      return {
        name: `${dateStr} (${size})`,
        value: filename,
        short: filename
      };
    })
  );

  // Let user select backup
  const { selectedBackup } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedBackup',
      message: 'Select backup to restore:',
      choices: backupChoices,
      pageSize: 10
    }
  ]);

  const backupPath = path.join(backupsDir, selectedBackup);

  // Show what will be restored
  console.log(chalk.bold('\n📋 Restore details:'));
  const stats = await fs.promises.stat(backupPath);
  console.log(chalk.gray(`  Source: ${selectedBackup}`));
  console.log(chalk.gray(`  Size: ${formatSize(stats.size)}`));

  // Confirm restoration
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'This will replace your current configuration. Continue?',
      default: false
    }
  ]);

  if (!confirmed) {
    console.log(chalk.gray('\nRestore cancelled.\n'));
    return;
  }

  const spinner = ora('Restoring configuration...').start();

  try {
    const configPath = getConfigPath();

    // Backup current config before overwriting (safety)
    if (fs.existsSync(configPath)) {
      const safetyBackup = configPath + '.pre-restore';
      await fs.promises.copyFile(configPath, safetyBackup);
      spinner.text = 'Current config backed up, restoring...';
    }

    // Restore selected backup
    await fs.promises.copyFile(backupPath, configPath);

    spinner.succeed('Configuration restored');

    console.log(chalk.bold.green('\n✓ Configuration restored successfully!\n'));
    console.log(chalk.gray('Run "claude-phone start" to apply changes.\n'));
  } catch (error) {
    spinner.fail(`Restore failed: ${error.message}`);
    throw error;
  }
}
