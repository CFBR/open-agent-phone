import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * Check if current user needs sudo for privileged operations
 * @returns {boolean} True if sudo is needed
 */
export function checkSudoNeeded() {
  // Check if running as root
  try {
    const uid = execSync('id -u', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    return uid !== '0';
  } catch (error) {
    // Assume sudo is needed if we can't check
    return true;
  }
}

/**
 * Check if user can use sudo
 * @returns {{canSudo: boolean, inSudoers: boolean}} Sudo availability
 */
export function checkSudoAvailable() {
  try {
    // Try sudo -n true (non-interactive, just check if we can sudo)
    execSync('sudo -n true', { stdio: 'pipe' });

    return {
      canSudo: true,
      inSudoers: true
    };
  } catch (error) {
    // Check if user is in sudoers but needs password
    try {
      execSync('sudo -l', { stdio: 'pipe' });
      return {
        canSudo: true,
        inSudoers: true
      };
    } catch (e) {
      // User not in sudoers
      return {
        canSudo: false,
        inSudoers: false
      };
    }
  }
}

/**
 * Cache sudo credentials by running sudo -v
 * @returns {Promise<boolean>} True if successful
 */
export async function cacheSudoCredentials() {
  try {
    console.log(chalk.cyan('\nCaching sudo credentials...'));
    execSync('sudo -v', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(chalk.red('Failed to cache sudo credentials'));
    return false;
  }
}

/**
 * Run commands with sudo, showing what will run and getting confirmation
 * @param {Array<string>} commands - Commands to run
 * @param {object} options - Options
 * @returns {Promise<{success: boolean, cancelled?: boolean}>}
 */
export async function withSudo(commands, options = {}) {
  const needsSudo = checkSudoNeeded();

  if (!needsSudo) {
    // Running as root, no sudo needed
    console.log(chalk.gray('Running as root, sudo not needed'));

    for (const cmd of commands) {
      try {
        execSync(cmd, { stdio: 'inherit' });
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    return { success: true };
  }

  // Check if user can sudo
  const sudoAvailable = checkSudoAvailable();

  if (!sudoAvailable.inSudoers) {
    console.error(chalk.red('\n❌ Error: Current user is not in sudoers group'));
    console.log(chalk.yellow('\nYou need administrator privileges to run these commands.'));
    console.log(chalk.yellow('Ask your system administrator to add you to sudoers.'));

    return {
      success: false,
      cancelled: true,
      error: 'not_in_sudoers'
    };
  }

  // Show what will run
  console.log(chalk.yellow('\n⚠️  The following commands require administrator access:\n'));

  for (const cmd of commands) {
    console.log(chalk.cyan(`  sudo ${cmd}`));
  }

  console.log('');

  // Get confirmation unless skipConfirm is set
  if (!options.skipConfirm) {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Run these commands as root?',
        default: false
      }
    ]);

    if (!confirmed) {
      return {
        success: false,
        cancelled: true
      };
    }
  }

  // Cache sudo credentials
  const cached = await cacheSudoCredentials();

  if (!cached) {
    return {
      success: false,
      error: 'failed_to_cache_credentials'
    };
  }

  // Run commands
  for (const cmd of commands) {
    try {
      execSync(`sudo ${cmd}`, { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red(`\n❌ Command failed: ${cmd}`));

      return {
        success: false,
        error: error.message
      };
    }
  }

  return { success: true };
}

/**
 * Show manual instructions if user can't or won't use sudo
 * @param {Array<string>} commands - Commands that need to be run
 * @returns {void}
 */
export function showManualInstructions(commands) {
  console.log(chalk.yellow('\n📋 Manual installation required'));
  console.log(chalk.gray('\nRun these commands manually:\n'));

  for (const cmd of commands) {
    console.log(chalk.cyan(`  sudo ${cmd}`));
  }

  console.log('');
}
