# Tasks: Prerequisite Checks with Auto-Fix

## Implementation Checklist

### Phase 1: Platform Detection (AC5)

- [ ] **1.1** Create `cli/lib/prereqs/platform.js`
  - [ ] Implement `detectPlatform()` function
  - [ ] Detect OS via `os.platform()` (darwin, linux)
  - [ ] Detect architecture via `os.arch()` (x86_64, arm64, armv7l)
  - [ ] Parse `/etc/os-release` on Linux for distro info
  - [ ] Detect Raspberry Pi via `/sys/firmware/devicetree/base/model`
  - [ ] Map distro to package manager (apt, dnf, yum, pacman, brew)
  - [ ] Export platform info object

- [ ] **1.2** Write tests for platform detection
  - [ ] Test macOS detection
  - [ ] Test Ubuntu/Debian detection
  - [ ] Test RHEL/Fedora detection
  - [ ] Test Arch detection
  - [ ] Test ARM architecture detection
  - [ ] Test Pi detection

### Phase 2: Core Checks (AC1-AC4, AC6-AC7)

- [ ] **2.1** Create `cli/lib/prereqs/checks/node.js`
  - [ ] Run `node --version` and parse output
  - [ ] Compare version with semver (>=18.0.0)
  - [ ] Handle "command not found" gracefully
  - [ ] Handle version string formats (v20.11.0, 20.11.0)
  - [ ] Return standardized check result object

- [ ] **2.2** Create `cli/lib/prereqs/checks/docker.js`
  - [ ] Run `docker --version` to check installed
  - [ ] Run `docker ps` to check daemon running
  - [ ] Distinguish "not installed" vs "not running" vs "permission denied"
  - [ ] Return standardized check result object

- [ ] **2.3** Create `cli/lib/prereqs/checks/compose.js`
  - [ ] Try `docker compose version` first (plugin)
  - [ ] Fall back to `docker-compose --version` (standalone)
  - [ ] Report which variant is available
  - [ ] Handle neither being available
  - [ ] Return standardized check result object

- [ ] **2.4** Create `cli/lib/prereqs/checks/disk.js`
  - [ ] Get available disk space (parse `df -h /`)
  - [ ] Check Docker data directory space if Docker exists
  - [ ] Require minimum 2GB free
  - [ ] Return human-readable size in result

- [ ] **2.5** Create `cli/lib/prereqs/checks/network.js`
  - [ ] HTTP HEAD to npmjs.org (5s timeout)
  - [ ] HTTP HEAD to docker.io (5s timeout)
  - [ ] HTTP HEAD to nodesource.com (5s timeout)
  - [ ] Track which hosts are reachable
  - [ ] Return connectivity status per host

- [ ] **2.6** Write tests for all checks
  - [ ] Mock execSync for version commands
  - [ ] Test version parsing edge cases
  - [ ] Test failure scenarios

### Phase 3: Secure Execution Utilities (AC8-AC9)

- [ ] **3.1** Create `cli/lib/prereqs/utils/execute.js`
  - [ ] Implement `downloadFile(url, destPath)`
  - [ ] Implement `readLines(file, count)` for preview
  - [ ] Implement `showPreview(file)` - display first 50 lines
  - [ ] Implement `runWithLogging(script, options)` - execute and log
  - [ ] Log all commands to `~/.claude-phone/prereq-install.log`

- [ ] **3.2** Create `cli/lib/prereqs/utils/sudo.js`
  - [ ] Implement `checkSudoNeeded()` - check if current user needs sudo
  - [ ] Implement `checkSudoAvailable()` - check if user can sudo
  - [ ] Implement `cacheSudoCredentials()` - run `sudo -v`
  - [ ] Implement `withSudo(commands)` - run commands with sudo
  - [ ] Show commands before execution, require confirmation
  - [ ] Handle wrong password gracefully

- [ ] **3.3** Write tests for execution utilities
  - [ ] Test file download (mock HTTP)
  - [ ] Test preview generation
  - [ ] Test sudo detection

### Phase 4: Node.js Installer (AC10)

- [ ] **4.1** Create `cli/lib/prereqs/installers/node.js`
  - [ ] Implement `installNode(platform)` router
  - [ ] Implement `installNodeApt()` for Ubuntu/Debian
    - [ ] Download NodeSource script to temp
    - [ ] Show preview, get confirmation
    - [ ] Run with sudo
    - [ ] Install nodejs package
  - [ ] Implement `installNodeDnf()` for RHEL/Fedora
  - [ ] Implement `installNodePacman()` for Arch
  - [ ] Implement `installNodeBrew()` for macOS
  - [ ] Verify installation after running
  - [ ] Provide manual instructions if user declines

- [ ] **4.2** Write tests for Node installer
  - [ ] Test command generation for each platform
  - [ ] Test decline flow shows manual instructions

### Phase 5: Docker Installer (AC11-AC12)

- [ ] **5.1** Create `cli/lib/prereqs/installers/docker.js`
  - [ ] Implement `installDocker(platform)` router
  - [ ] Implement `installDockerApt()` for Ubuntu/Debian
    - [ ] Add Docker GPG key
    - [ ] Add Docker apt repository
    - [ ] Install docker-ce, docker-ce-cli, containerd.io
    - [ ] Add user to docker group
    - [ ] Start Docker daemon
  - [ ] Implement `installDockerDnf()` for RHEL/Fedora
  - [ ] Implement `installDockerPacman()` for Arch
  - [ ] Verify installation after running

- [ ] **5.2** Create `cli/lib/prereqs/installers/docker-desktop.js`
  - [ ] Implement `isDockerDesktopInstalled()` - check /Applications
  - [ ] Implement `launchDockerDesktop()` - `open -a Docker`
  - [ ] Implement `installViaHomebrew()` - `brew install --cask docker`
  - [ ] Implement `waitForDockerDaemon(timeout)` - poll every 5s
  - [ ] Show spinner during wait
  - [ ] Timeout after 5 minutes
  - [ ] Handle manual install flow (show URL, wait for Enter)

- [ ] **5.3** Write tests for Docker installer
  - [ ] Test command generation for each platform
  - [ ] Test Docker Desktop detection on macOS
  - [ ] Test wait-for-daemon timeout

### Phase 6: Rollback Support (AC16)

- [ ] **6.1** Create `cli/lib/prereqs/utils/rollback.js`
  - [ ] Implement `saveState()` - capture current versions
  - [ ] Implement `loadState()` - read saved state
  - [ ] Implement `rollback(state)` - attempt restoration
  - [ ] Store state in `~/.claude-phone/prereq-state.json`
  - [ ] Provide manual recovery instructions if rollback limited

- [ ] **6.2** Write tests for rollback
  - [ ] Test state save/load
  - [ ] Test state file format

### Phase 7: Main Orchestrator (AC1, AC13-AC15, AC17-AC19)

- [ ] **7.1** Create `cli/lib/prereqs.js` (main entry)
  - [ ] Import all check modules
  - [ ] Import all installer modules
  - [ ] Implement `runPrereqChecks(options)`
    - [ ] Detect platform first
    - [ ] Run all checks in parallel
    - [ ] Collect and display results
    - [ ] Handle `--skip-prereqs` flag (AC17)
    - [ ] Handle offline mode (AC19)
  - [ ] Implement `displayResults(results)` - formatted output
  - [ ] Implement `offerAutoFix(failures, platform)` - prompt for each
  - [ ] Re-run checks after auto-fix to verify

- [ ] **7.2** Create `cli/lib/prereqs/index.js`
  - [ ] Re-export all modules for clean imports

- [ ] **7.3** Write integration tests
  - [ ] Test full success path
  - [ ] Test failure with auto-fix accepted
  - [ ] Test failure with auto-fix declined
  - [ ] Test skip flag
  - [ ] Test offline mode

### Phase 8: Integration with Setup (AC1)

- [ ] **8.1** Modify `cli/lib/commands/setup.js`
  - [ ] Import `runPrereqChecks` from prereqs.js
  - [ ] Add `--skip-prereqs` option to command
  - [ ] Call prereq checks at start of setup()
  - [ ] Exit if checks fail and user doesn't fix
  - [ ] Continue to existing setup flow if checks pass

- [ ] **8.2** Update CLI help text
  - [ ] Add `--skip-prereqs` to setup command help
  - [ ] Document what prerequisites are checked

- [ ] **8.3** Integration testing
  - [ ] Test setup with all prereqs met
  - [ ] Test setup with missing prereqs
  - [ ] Test setup with --skip-prereqs

### Phase 9: Documentation & Cleanup

- [ ] **9.1** Update user documentation
  - [ ] Document prerequisite requirements in README
  - [ ] Document auto-fix capabilities
  - [ ] Document --skip-prereqs flag
  - [ ] Add troubleshooting section for common issues

- [ ] **9.2** Update CLAUDE.md
  - [ ] Mark feature as complete
  - [ ] Document new files added
  - [ ] Update CLI command reference

- [ ] **9.3** Final review
  - [ ] Run full test suite
  - [ ] Test on fresh Ubuntu VM
  - [ ] Test on macOS
  - [ ] Test on Raspberry Pi
  - [ ] Lint all new code

## Acceptance Criteria Mapping

| AC | Task(s) |
|----|---------|
| AC1 | 7.1, 8.1 |
| AC2 | 2.1 |
| AC3 | 2.2 |
| AC4 | 2.3 |
| AC5 | 1.1, 1.2 |
| AC6 | 2.4 |
| AC7 | 2.5 |
| AC8 | 3.1 |
| AC9 | 3.2 |
| AC10 | 4.1 |
| AC11 | 5.1 |
| AC12 | 5.2 |
| AC13 | 7.1 |
| AC14 | 7.1 |
| AC15 | 7.1, 6.1 |
| AC16 | 6.1 |
| AC17 | 7.1, 8.1 |
| AC18 | 7.1 |
| AC19 | 7.1 |

## Estimated Effort

| Phase | Tasks | Complexity |
|-------|-------|------------|
| 1. Platform Detection | 2 | Medium |
| 2. Core Checks | 6 | Medium |
| 3. Execution Utils | 3 | High (security-critical) |
| 4. Node Installer | 2 | Medium |
| 5. Docker Installer | 3 | High (many edge cases) |
| 6. Rollback | 2 | Low |
| 7. Orchestrator | 3 | Medium |
| 8. Integration | 3 | Low |
| 9. Docs & Cleanup | 3 | Low |

**Total: 27 tasks across 9 phases**
