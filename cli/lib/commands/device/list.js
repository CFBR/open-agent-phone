import chalk from 'chalk';
import { loadConfig, configExists } from '../../config.js';

/**
 * Device list command - List all configured devices
 * @returns {Promise<void>}
 */
export async function deviceListCommand() {
  console.log(chalk.bold.cyan('\n📱 Configured Devices\n'));

  if (!configExists()) {
    console.log(chalk.red('✗ Not configured'));
    console.log(chalk.gray('  Run "claude-phone setup" first\n'));
    process.exit(1);
  }

  const config = await loadConfig();

  if (config.devices.length === 0) {
    console.log(chalk.yellow('No devices configured.'));
    console.log(chalk.gray('  Run "claude-phone device add" to add a device\n'));
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(10, ...config.devices.map(d => d.name.length));
  const extWidth = 9; // "Extension"
  const voiceWidth = 30;

  // Print header
  const horizontalLine = '─'.repeat(nameWidth + extWidth + voiceWidth + 8);
  console.log('┌' + horizontalLine + '┐');

  const namePad = 'Name'.padEnd(nameWidth);
  const extPad = 'Extension'.padEnd(extWidth);
  const voicePad = 'Voice ID'.padEnd(voiceWidth);
  console.log(`│ ${chalk.bold(namePad)} │ ${chalk.bold(extPad)} │ ${chalk.bold(voicePad)} │`);

  console.log('├' + horizontalLine + '┤');

  // Print devices
  const ttsProvider = config.api?.ttsProvider || 'elevenlabs';
  for (const device of config.devices) {
    const namePad = device.name.padEnd(nameWidth);
    const extPad = device.extension.padEnd(extWidth);
    const resolvedVoice = ttsProvider === 'kokoro'
      ? (device.kokoroVoiceId || device.voiceId || '')
      : (device.elevenlabsVoiceId || device.voiceId || '');
    const voiceText = resolvedVoice || '[default]';
    const voiceDisplay = voiceText.length > voiceWidth
      ? voiceText.substring(0, voiceWidth - 3) + '...'
      : voiceText.padEnd(voiceWidth);

    console.log(`│ ${namePad} │ ${extPad} │ ${voiceDisplay} │`);
  }

  console.log('└' + horizontalLine + '┘');

  console.log(chalk.gray(`\nTotal: ${config.devices.length} device(s)\n`));
}
