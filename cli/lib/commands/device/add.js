import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig, configExists } from '../../config.js';
import { validateExtension, validateVoiceId } from '../../validators.js';
import { writeDockerConfig } from '../../docker.js';

/**
 * Device add command - Add a new SIP device
 * @returns {Promise<void>}
 */
export async function deviceAddCommand() {
  console.log(chalk.bold.cyan('\n➕ Add New Device\n'));

  if (!configExists()) {
    console.log(chalk.red('✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  const config = await loadConfig();
  const ttsProvider = config.api?.ttsProvider || 'elevenlabs';

  // Gather device information
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Device name:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Device name cannot be empty';
        }
        // Check for duplicate names
        const duplicate = config.devices.find(d => d.name.toLowerCase() === input.trim().toLowerCase());
        if (duplicate) {
          return `Device name "${input}" already exists`;
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'extension',
      message: 'SIP extension (4-5 digits):',
      validate: (input) => {
        if (!validateExtension(input)) {
          return 'Extension must be 4-5 digits';
        }
        // Check for duplicate extensions
        const duplicate = config.devices.find(d => d.extension === input);
        if (duplicate) {
          return `Extension ${input} is already used by device "${duplicate.name}"`;
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'authId',
      message: 'SIP auth ID (press Enter to use extension):',
      default: (answers) => answers.extension
    },
    {
      type: 'password',
      name: 'password',
      message: 'SIP password:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Password cannot be empty';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'elevenlabsVoiceId',
      message: 'ElevenLabs voice ID:',
      default: config.api.elevenlabs.defaultVoiceId || '',
      when: () => ttsProvider === 'elevenlabs',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Voice ID cannot be empty';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'kokoroVoiceId',
      message: 'Kokoro voice ID (e.g., af_heart, am_adam):',
      default: config.api.kokoroVoiceId || 'af_heart',
      when: () => ttsProvider === 'kokoro',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Voice ID cannot be empty';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'prompt',
      message: 'System prompt:',
      default: (answers) => `You are ${answers.name}, a helpful AI assistant accessible via phone.`
    }
  ]);

  const elevenlabsVoiceId = answers.elevenlabsVoiceId || '';
  const kokoroVoiceId = answers.kokoroVoiceId
    || config.api.kokoroVoiceId
    || 'af_heart';

  // Validate the ElevenLabs voice only when that provider is active.
  let voiceLabel = kokoroVoiceId;
  if (ttsProvider === 'elevenlabs') {
    const spinner = ora('Validating voice ID with ElevenLabs...').start();
    const voiceResult = await validateVoiceId(config.api.elevenlabs.apiKey, elevenlabsVoiceId);

    if (!voiceResult.valid) {
      spinner.fail(chalk.red(`Voice ID validation failed: ${voiceResult.error}`));
      console.log(chalk.gray('\nPlease check your voice ID and try again.\n'));
      process.exit(1);
    }

    spinner.succeed(chalk.green(`Voice validated: ${voiceResult.name}`));
    voiceLabel = `${voiceResult.name} (${elevenlabsVoiceId})`;
  } else {
    console.log(chalk.gray(`  Using Kokoro TTS voice: ${kokoroVoiceId} (no API validation needed)`));
  }

  // Add device to config
  const newDevice = {
    name: answers.name.trim(),
    extension: answers.extension,
    authId: answers.authId || answers.extension,
    password: answers.password,
    elevenlabsVoiceId: elevenlabsVoiceId,
    kokoroVoiceId: kokoroVoiceId,
    voiceId: elevenlabsVoiceId, // legacy ElevenLabs field
    prompt: answers.prompt || `You are ${answers.name}, a helpful AI assistant accessible via phone.`
  };

  config.devices.push(newDevice);

  // Save config
  const saveSpinner = ora('Saving configuration...').start();
  await saveConfig(config);

  // Regenerate Docker config with new device
  await writeDockerConfig(config);

  saveSpinner.succeed(chalk.green('Configuration saved'));

  console.log(chalk.bold.green('\n✓ Device added successfully!'));
  console.log(chalk.gray('\nDevice details:'));
  console.log(chalk.gray(`  Name: ${newDevice.name}`));
  console.log(chalk.gray(`  Extension: ${newDevice.extension}`));
  console.log(chalk.gray(`  Voice: ${voiceLabel}`));
  console.log(chalk.yellow('\n⚠ Restart services to apply changes:'));
  console.log(chalk.gray('  claude-phone stop'));
  console.log(chalk.gray('  claude-phone start\n'));
}
