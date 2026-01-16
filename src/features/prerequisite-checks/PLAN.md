# Technical Plan: Prerequisite Checks with Auto-Fix

## Overview
Implement intelligent prerequisite checking at the start of `claude-phone setup` with platform-aware auto-fix capabilities.

## Architecture

### File Structure
```
cli/lib/
├── prereqs.js                    # Main entry point & orchestrator
├── prereqs/
│   ├── index.js                  # Re-exports all modules
│   ├── platform.js               # OS/distro/arch detection
│   ├── checks/
│   │   ├── node.js               # Node.js version check
│   │   ├── docker.js             # Docker & daemon check
│   │   ├── compose.js            # Docker Compose check
│   │   ├── disk.js               # Disk space check
│   │   └── network.js            # Network connectivity check
│   ├── installers/
│   │   ├── node.js               # Node.js auto-install
│   │   ├── docker.js             # Docker auto-install
│   │   └── docker-desktop.js     # macOS Docker Desktop flow
│   └── utils/
│       ├── execute.js            # Safe command execution
│       ├── sudo.js               # Sudo permission handling
│       └── rollback.js           # State tracking & rollback
```

### Data Flow
```
setup.js
    │
    ▼
prereqs.js (orchestrator)
    │
    ├─► platform.js (detect OS/distro/arch)
    │
    ├─► Run all checks in parallel:
    │   ├─► node.js check
    │   ├─► docker.js check
    │   ├─► compose.js check
    │   ├─► disk.js check
    │   └─► network.js check
    │
    ├─► Collect results
    │
    ├─► If all pass → return success
    │
    └─► If failures:
        ├─► Offer auto-fix for each
        ├─► Run installers sequentially
        ├─► Track state for rollback
        └─► Re-verify after install
```

## Implementation Phases

### Phase 1: Platform Detection (AC5)
**Files:** `prereqs/platform.js`

```javascript
// Detects and returns platform info
export async function detectPlatform() {
  return {
    os: 'linux',           // darwin, linux
    distro: 'ubuntu',      // ubuntu, debian, fedora, rhel, arch, macos
    distroVersion: '22.04',
    arch: 'x86_64',        // x86_64, arm64, armv7l
    packageManager: 'apt', // apt, dnf, yum, pacman, brew
    isArm: false,
    isPi: false,
  };
}
```

**Implementation:**
- `os.platform()` for OS
- Parse `/etc/os-release` for Linux distro
- `os.arch()` for architecture
- Check for `/sys/firmware/devicetree/base/model` for Pi detection

### Phase 2: Core Checks (AC1-AC4, AC6-AC7)
**Files:** `prereqs/checks/*.js`

Each check module exports:
```javascript
export async function check(platform) {
  return {
    name: 'Node.js',
    passed: true,
    version: '20.11.0',
    required: '>=18.0.0',
    message: 'Node.js v20.11.0 (requires ≥18)',
    canAutoFix: true,
  };
}
```

**Node.js Check:**
- Run `node --version`
- Parse version, compare with semver
- Handle "command not found"

**Docker Check:**
- Run `docker --version` (installed?)
- Run `docker ps` (daemon running?)
- Distinguish "not installed" vs "not running" vs "permission denied"

**Compose Check:**
- Try `docker compose version` first
- Fall back to `docker-compose --version`
- Return which variant is available

**Disk Check:**
- Use `os.freemem()` for quick check
- Parse `df -h /` for accurate disk space
- Check Docker data dir if Docker installed

**Network Check:**
- HTTP HEAD to npmjs.org, docker.io, nodesource.com
- 5 second timeout per host
- Track which hosts are reachable

### Phase 3: Secure Execution (AC8-AC9)
**Files:** `prereqs/utils/execute.js`, `prereqs/utils/sudo.js`

**Safe Script Execution:**
```javascript
export async function executeScript(url, options) {
  // 1. Download to temp file
  const tempFile = `/tmp/prereq_${Date.now()}.sh`;
  await downloadFile(url, tempFile);

  // 2. Show preview
  const preview = await readLines(tempFile, 50);
  console.log('Script preview:');
  console.log(preview);

  // 3. Get confirmation
  const confirmed = await confirm('Run this script? (y/N)');
  if (!confirmed) return { cancelled: true };

  // 4. Execute with logging
  return await runWithLogging(tempFile, options);
}
```

**Sudo Handling:**
```javascript
export async function withSudo(commands) {
  // 1. Check if sudo needed
  const needsSudo = await checkSudoNeeded();

  // 2. Show what will run
  console.log('The following commands require admin access:');
  commands.forEach(cmd => console.log(`  ${cmd}`));

  // 3. Get confirmation
  const confirmed = await confirm('Run as root? (y/N)');
  if (!confirmed) return { cancelled: true };

  // 4. Cache credentials
  await exec('sudo -v');

  // 5. Run commands
  for (const cmd of commands) {
    await exec(`sudo ${cmd}`);
  }
}
```

### Phase 4: Auto-Installers (AC10-AC12)
**Files:** `prereqs/installers/*.js`

**Node.js Installer:**
```javascript
export async function installNode(platform) {
  switch (platform.packageManager) {
    case 'apt':
      return await installNodeApt();
    case 'dnf':
    case 'yum':
      return await installNodeDnf();
    case 'pacman':
      return await installNodePacman();
    case 'brew':
      return await installNodeBrew();
  }
}

async function installNodeApt() {
  const script = 'https://deb.nodesource.com/setup_20.x';
  const tempFile = '/tmp/nodesource_setup.sh';

  // Download, preview, confirm, execute
  await downloadFile(script, tempFile);
  await showPreview(tempFile);

  if (!await confirm('Run NodeSource setup as root? (y/N)')) {
    return showManualInstructions('apt');
  }

  await withSudo([
    `bash ${tempFile}`,
    'apt-get install -y nodejs'
  ]);

  // Verify
  const result = await checkNode();
  return result.passed;
}
```

**Docker Installer:**
```javascript
export async function installDocker(platform) {
  switch (platform.os) {
    case 'darwin':
      return await installDockerDesktop();
    case 'linux':
      return await installDockerLinux(platform);
  }
}
```

**Docker Desktop Flow (macOS):**
```javascript
export async function installDockerDesktop() {
  // Check if installed but not running
  const installed = await isDockerDesktopInstalled();

  if (installed) {
    console.log('Docker Desktop is installed but not running.');
    if (await confirm('Launch Docker Desktop? (Y/n)', true)) {
      await exec('open -a Docker');
      return await waitForDockerDaemon();
    }
  } else {
    // Offer brew install
    if (await confirm('Install Docker Desktop via Homebrew? (y/N)')) {
      await exec('brew install --cask docker');
      await exec('open -a Docker');
      return await waitForDockerDaemon();
    } else {
      // Show manual instructions
      console.log('Download Docker Desktop from:');
      console.log('  https://www.docker.com/products/docker-desktop/');
      console.log('\nPress Enter when installed...');
      await waitForEnter();
      return await waitForDockerDaemon();
    }
  }
}

async function waitForDockerDaemon(timeout = 300000) {
  const start = Date.now();
  const spinner = ora('Waiting for Docker daemon...').start();

  while (Date.now() - start < timeout) {
    const running = await isDockerRunning();
    if (running) {
      spinner.succeed('Docker daemon ready!');
      return true;
    }
    spinner.text = `Waiting for Docker... (${Math.floor((Date.now() - start) / 1000)}s)`;
    await sleep(5000);
  }

  spinner.fail('Timeout waiting for Docker daemon');
  return false;
}
```

### Phase 5: Rollback Support (AC16)
**Files:** `prereqs/utils/rollback.js`

```javascript
const STATE_FILE = path.join(getConfigDir(), 'prereq-state.json');

export async function saveState() {
  const state = {
    timestamp: Date.now(),
    node: await getNodeVersion(),
    docker: await getDockerVersion(),
    compose: await getComposeVersion(),
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

export async function rollback(savedState) {
  // Note: Full rollback is complex and limited
  // We mainly warn and provide manual instructions
  console.log('Previous state:');
  console.log(`  Node.js: ${savedState.node || 'not installed'}`);
  console.log(`  Docker: ${savedState.docker || 'not installed'}`);
  console.log('\nAutomatic rollback is limited. Manual steps may be needed.');
}
```

### Phase 6: Integration with setup.js (AC1)
**Files:** `cli/lib/commands/setup.js`

```javascript
import { runPrereqChecks } from '../prereqs.js';

export async function setup(options) {
  // Skip if flag provided
  if (!options.skipPrereqs) {
    console.log('\n🔍 Checking prerequisites...\n');

    const result = await runPrereqChecks();

    if (!result.success) {
      console.log('\n❌ Prerequisites not met. Please fix the issues above and try again.');
      process.exit(1);
    }

    console.log('\n✅ All prerequisites met!\n');
  }

  // Continue with existing setup flow...
}
```

## Testing Strategy

### Unit Tests
- Platform detection for each OS/distro
- Version parsing (v20.11.0, 20.11.0, 20.11.0-rc1)
- Check result formatting
- Installer command generation

### Integration Tests
- Mock command execution
- Test full flow with various failure scenarios
- Test rollback state saving/loading

### Manual Testing Matrix
| Platform | Node Check | Docker Check | Node Install | Docker Install |
|----------|------------|--------------|--------------|----------------|
| Ubuntu 22.04 | ✓ | ✓ | ✓ | ✓ |
| Debian 12 | ✓ | ✓ | ✓ | ✓ |
| Fedora 39 | ✓ | ✓ | ✓ | ✓ |
| Arch | ✓ | ✓ | ✓ | ✓ |
| macOS 14 | ✓ | ✓ | ✓ | ✓ |
| Raspberry Pi OS | ✓ | ✓ | ✓ | ✓ |

## Dependencies

**New npm packages:**
- `semver` - Version comparison
- `ora` - Spinners (already used)
- `axios` - HTTP requests for network check (already used)

**No new dependencies needed** - can use existing packages.

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| NodeSource script changes | Download and preview, don't blindly execute |
| Docker repo GPG issues | Fallback to manual instructions |
| Sudo password caching expires | Re-prompt if needed mid-flow |
| Network flakiness | Retry logic, offline fallback |
| ARM image availability | Check architecture before proceeding |

## Rollout Plan

1. **Phase 1**: Ship checks only (no auto-install)
   - Validates platform detection works
   - Users see what's missing
   - Manual instructions provided

2. **Phase 2**: Add Node.js auto-install
   - Lower risk, simpler than Docker
   - Validates secure execution flow

3. **Phase 3**: Add Docker auto-install
   - Linux distros first
   - macOS Docker Desktop last

## Success Criteria

- [ ] All 19 ACs pass
- [ ] Works on all target platforms
- [ ] No security vulnerabilities (curl | bash)
- [ ] Clear error messages on failure
- [ ] Graceful degradation when offline
