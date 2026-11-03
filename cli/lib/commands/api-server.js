import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import path from 'path';
import { loadConfig, configExists } from '../config.js';
import { getProjectRoot } from '../utils.js';
import { savePid, removePid, buildApiServerEnv } from '../process-manager.js';

/**
 * API Server command - Start claude-api-server for remote connections
 * @param {object} options - Command options
 * @param {number} options.port - Port to listen on (default: 3333)
 * @returns {Promise<void>}
 */
export async function apiServerCommand(options = {}) {
  console.log(chalk.bold.cyan('\n🤖 Claude API Server\n'));

  // Load config to get the port and provider settings if not provided
  const config = configExists() ? await loadConfig() : {};

  const port = options.port || config.server?.claudeApiPort || 3333;

  console.log(chalk.gray(`Starting API server on port ${port}...`));
  console.log(chalk.gray('This wraps Claude Code CLI for Pi connections.\n'));

  const projectRoot = getProjectRoot();
  const serverPath = path.join(projectRoot, 'claude-api-server', 'server.js');

  const spinner = ora('Starting server...').start();

  try {
    const env = {
      ...buildApiServerEnv(config),
      PORT: port.toString(),
      // This command exists to serve remote voice servers, so bind to all
      // interfaces unless the user overrides it.
      CLAUDE_API_HOST: process.env.CLAUDE_API_HOST || '0.0.0.0'
    };

    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        ...env
      },
      stdio: 'inherit'
    });

    // Use the same PID file as start/stop/status so the process is visible.
    savePid('server', child.pid);

    spinner.succeed(chalk.green('Server started'));
    console.log(chalk.bold.cyan(`\n📡 Listening on port ${port}\n`));
    console.log(chalk.gray('Waiting for Pi connections...'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    // Handle cleanup on exit
    const cleanup = () => {
      removePid('server');
      child.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Wait for child to exit
    child.on('exit', (code) => {
      removePid('server');
      if (code !== 0) {
        console.log(chalk.red(`\n✗ Server exited with code ${code}\n`));
        process.exit(code);
      }
    });

  } catch (error) {
    spinner.fail(chalk.red('Failed to start server'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    throw error;
  }
}
