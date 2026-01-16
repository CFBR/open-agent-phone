# Technical Plan: Installation Type Selector

## Overview
Add installation type selection to `claude-phone setup` that customizes the setup flow and service management based on deployment type.

## Architecture

### Installation Types

```
┌─────────────────────────────────────────────────────────────┐
│                    Installation Types                        │
├─────────────────┬───────────────────┬───────────────────────┤
│  Voice Server   │    API Server     │        Both           │
├─────────────────┼───────────────────┼───────────────────────┤
│ • Docker        │ • Node.js only    │ • Everything          │
│ • drachtio      │ • claude-api-srv  │ • Docker + API server │
│ • FreeSWITCH    │ • Port config     │ • Full setup flow     │
│ • voice-app     │                   │                       │
│ • SIP/3CX config│                   │                       │
│ • API keys      │                   │                       │
├─────────────────┼───────────────────┼───────────────────────┤
│ Prereqs:        │ Prereqs:          │ Prereqs:              │
│ Node, Docker,   │ Node only         │ Node, Docker,         │
│ Compose, Disk   │                   │ Compose, Disk         │
└─────────────────┴───────────────────┴───────────────────────┘
```

### Data Flow

```
setup.js
    │
    ▼
runPrereqChecks({ type: 'minimal' })  ← Only Node.js check first
    │
    ▼
promptInstallationType()  ← User selects type
    │
    ├─► 'api-server' ──► runPrereqChecks({ type: 'api-server' })
    │                         │
    │                         ▼
    │                    setupApiServer()  ← Port only
    │
    ├─► 'voice-server' ──► runPrereqChecks({ type: 'voice-server' })
    │                           │
    │                           ▼
    │                      setupVoiceServer()  ← SIP, keys, devices
    │
    └─► 'both' ──► runPrereqChecks({ type: 'both' })
                        │
                        ▼
                   setupBoth()  ← All questions (current flow)
```

## Implementation Phases

### Phase 1: Config Schema Update

**File:** `cli/lib/config.js`

Add `installationType` field to config schema:

```javascript
const DEFAULT_CONFIG = {
  installationType: 'both',  // 'voice-server' | 'api-server' | 'both'
  server: { ... },
  sip: { ... },
  devices: [ ... ],
  api: { ... }
};
```

**Backward compatibility:** Configs without `installationType` default to `'both'`.

### Phase 2: Installation Type Prompt

**File:** `cli/lib/commands/setup.js`

Add prompt after minimal prereq check:

```javascript
async function promptInstallationType(currentType = 'both') {
  const { type } = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: 'What are you installing?',
    default: currentType,
    choices: [
      {
        name: 'Voice Server (Pi/Linux) - Handles calls, needs Docker',
        value: 'voice-server'
      },
      {
        name: 'API Server - Claude Code wrapper, minimal setup',
        value: 'api-server'
      },
      {
        name: 'Both (all-in-one) - Full stack on one machine',
        value: 'both'
      }
    ]
  }]);
  return type;
}
```

### Phase 3: Conditional Prereq Checks

**File:** `cli/lib/prereqs.js`

Modify `runPrereqChecks()` to accept type parameter:

```javascript
export async function runPrereqChecks(options = {}) {
  const { type = 'both', skipPrereqs = false } = options;

  if (skipPrereqs) {
    console.log(chalk.yellow('⚠️  Skipping prerequisite checks'));
    return { success: true, skipped: true };
  }

  // Always check Node.js
  const checks = [checkNode];

  // Add type-specific checks
  if (type === 'voice-server' || type === 'both') {
    checks.push(checkDocker, checkCompose, checkDisk);
  }

  // Network check for auto-fix capability
  if (type !== 'api-server') {
    checks.push(checkNetwork);
  }

  // Run checks...
}
```

### Phase 4: Setup Flow Refactor

**File:** `cli/lib/commands/setup.js`

Refactor into type-specific functions:

```javascript
export async function setupCommand(options) {
  // 1. Minimal prereq check (Node.js only)
  const minimalCheck = await runPrereqChecks({ type: 'minimal' });
  if (!minimalCheck.success) return;

  // 2. Get installation type
  const existingConfig = loadConfig();
  const installationType = await promptInstallationType(
    existingConfig.installationType || 'both'
  );

  // 3. Run type-specific prereq checks
  if (installationType !== 'api-server') {
    const fullCheck = await runPrereqChecks({ type: installationType });
    if (!fullCheck.success) return;
  }

  // 4. Run type-specific setup
  let config;
  switch (installationType) {
    case 'api-server':
      config = await setupApiServer(existingConfig);
      break;
    case 'voice-server':
      config = await setupVoiceServer(existingConfig);
      break;
    case 'both':
    default:
      config = await setupBoth(existingConfig);
      break;
  }

  // 5. Save config with type
  config.installationType = installationType;
  await saveConfig(config);
}
```

**Setup functions:**

```javascript
async function setupApiServer(config) {
  console.log(chalk.cyan('\n🖥️  API Server Configuration\n'));

  const answers = await inquirer.prompt([{
    type: 'input',
    name: 'port',
    message: 'API server port:',
    default: config.server?.claudeApiPort || 3333,
    validate: (v) => /^\d+$/.test(v) && v > 0 && v < 65536
  }]);

  return {
    ...config,
    server: {
      ...config.server,
      claudeApiPort: parseInt(answers.port)
    }
  };
}

async function setupVoiceServer(config) {
  // SBC/SIP config
  config = await setupSBC(config);

  // API server connection
  config = await setupApiServerConnection(config);

  // API keys
  config = await setupApiKeys(config);

  // Devices
  config = await setupDevices(config);

  // Generate Docker config
  await writeDockerConfig(config);

  return config;
}

async function setupBoth(config) {
  // Current full setup flow
  // ... existing implementation
}
```

### Phase 5: Start Command Update

**File:** `cli/lib/commands/start.js`

Respect installation type:

```javascript
export async function startCommand() {
  const config = loadConfig();
  const type = config.installationType || 'both';

  switch (type) {
    case 'api-server':
      await startApiServer();
      break;
    case 'voice-server':
      await startVoiceServer(config);
      break;
    case 'both':
    default:
      await startApiServer();
      await startVoiceServer(config);
      break;
  }
}

async function startApiServer() {
  // Start claude-api-server only
}

async function startVoiceServer(config) {
  // Check API server reachability
  // Start Docker containers
}
```

### Phase 6: Stop Command Update

**File:** `cli/lib/commands/stop.js`

Similar pattern to start:

```javascript
export async function stopCommand() {
  const config = loadConfig();
  const type = config.installationType || 'both';

  switch (type) {
    case 'api-server':
      await stopApiServer();
      break;
    case 'voice-server':
      await stopVoiceServer();
      break;
    case 'both':
    default:
      await stopApiServer();
      await stopVoiceServer();
      break;
  }
}
```

### Phase 7: Status Command Update

**File:** `cli/lib/commands/status.js`

Show type-appropriate status:

```javascript
export async function statusCommand() {
  const config = loadConfig();
  const type = config.installationType || 'both';

  console.log(chalk.cyan(`\n📊 Status (${type} installation)\n`));

  if (type === 'api-server' || type === 'both') {
    await showApiServerStatus();
  }

  if (type === 'voice-server' || type === 'both') {
    await showDockerStatus();
    await showSipStatus(config);
  }
}
```

### Phase 8: Doctor Command Update

**File:** `cli/lib/commands/doctor.js`

Type-appropriate health checks:

```javascript
export async function doctorCommand() {
  const config = loadConfig();
  const type = config.installationType || 'both';

  console.log(chalk.cyan(`\n🩺 Health Check (${type} installation)\n`));

  const checks = [];

  if (type === 'api-server' || type === 'both') {
    checks.push(checkApiServerHealth);
  }

  if (type === 'voice-server' || type === 'both') {
    checks.push(
      checkDockerHealth,
      checkContainersHealth,
      checkSipRegistration
    );
  }

  if (type === 'voice-server') {
    checks.push(checkApiServerReachability);
  }

  // Run all checks...
}
```

## Testing Strategy

### Unit Tests
- Config loading with/without installationType
- Type detection and defaults
- Prereq check filtering by type

### Integration Tests
- Full setup flow for each type
- Start/stop for each type
- Status output for each type

### Manual Testing Matrix

| Scenario | Voice Server | API Server | Both |
|----------|--------------|------------|------|
| Fresh setup | ✓ | ✓ | ✓ |
| Re-run setup | ✓ | ✓ | ✓ |
| Change type | ✓ | ✓ | ✓ |
| Start | ✓ | ✓ | ✓ |
| Stop | ✓ | ✓ | ✓ |
| Status | ✓ | ✓ | ✓ |
| Doctor | ✓ | ✓ | ✓ |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing installs | Default to 'both', preserve all current behavior |
| Confusing UX | Clear descriptions, show current type on re-run |
| Partial config states | Validate config completeness per type |

## Success Criteria

- [ ] All 9 ACs pass
- [ ] Existing 'both' installations work unchanged
- [ ] API Server setup is fast (< 30 seconds)
- [ ] Voice Server setup works on Pi
- [ ] Start/stop/status/doctor respect type
