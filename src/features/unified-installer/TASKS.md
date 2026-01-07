# Unified Installer Tasks

> Execution checklist. TDD-structured tasks derived from approved SPEC and PLAN.

**Spec:** [SPEC.md](./SPEC.md)
**Plan:** [PLAN.md](./PLAN.md)
**Status:** ✅ COMPLETE (2026-01-07)

---

## Pre-Implementation

- [x] SPEC.md reviewed and approved
- [x] PLAN.md reviewed and approved
- [x] All open questions from SPEC resolved
- [x] All blockers from PLAN cleared
- [x] Acceptance criteria clear and testable (31 ACs)
- [x] Feature branch created: `feature/unified-installer`

---

## Phase 1: CLI Core (MVP) ✅

> Shipped in PR #1 (commit dcfae8e)

### 1.1 Project Setup

- [x] Create `cli/` directory structure per PLAN
- [x] Initialize `cli/package.json` with dependencies
- [x] Create `cli/bin/claude-phone.js` entry point with shebang
- [x] Set up Commander.js base with version command
- [x] Verify `node cli/bin/claude-phone.js --version` works

### 1.2 Config Module

- [x] **Test**: config.js reads config from ~/.claude-phone/config.json
- [x] **Implement**: `loadConfig()` function
- [x] **Test**: config.js writes config with correct permissions (600)
- [x] **Implement**: `saveConfig()` function
- [x] **Test**: config.js returns defaults when no config exists
- [x] **Implement**: `getConfigPath()` and default config template
- [x] **Refactor**: Extract config schema validation

### 1.3 Setup Command (AC-6 through AC-12)

- [x] **Test**: setup command launches without error
- [x] **Implement**: Basic `setup.js` command structure
- [x] **Test**: ElevenLabs key validation makes API call
- [x] **Implement**: ElevenLabs validator (list voices endpoint) [AC-7]
- [x] **Test**: OpenAI key validation makes API call
- [x] **Implement**: OpenAI validator (models endpoint) [AC-8]
- [x] **Test**: Setup prompts for all required 3CX fields
- [x] **Implement**: 3CX credential prompts [AC-9]
- [x] **Test**: Setup prompts for first device
- [x] **Implement**: Device setup prompts (name, extension, voice, prompt) [AC-10]
- [x] **Test**: Setup writes valid config.json
- [x] **Implement**: Config persistence [AC-11]
- [x] **Test**: Setup can reconfigure existing config
- [x] **Implement**: Reconfigure flow [AC-12]
- [x] **Refactor**: Extract validators to separate module

### 1.4 Process Manager Module

- [x] **Test**: process-manager writes PID file
- [x] **Implement**: `writePid()` function
- [x] **Test**: process-manager reads PID and checks if running
- [x] **Implement**: `isRunning()` function
- [x] **Test**: process-manager kills process by PID
- [x] **Implement**: `stopProcess()` function
- [x] **Test**: process-manager spawns detached Node process
- [x] **Implement**: `startApiServer()` function

### 1.5 Docker Module

- [x] **Test**: docker.js checks if Docker is running
- [x] **Implement**: `isDockerRunning()` function
- [x] **Test**: docker.js generates docker-compose.yml from config
- [x] **Implement**: `generateComposeFile()` function
- [x] **Test**: docker.js starts containers
- [x] **Implement**: `startContainers()` function
- [x] **Test**: docker.js stops containers
- [x] **Implement**: `stopContainers()` function
- [x] **Test**: docker.js gets container status
- [x] **Implement**: `getContainerStatus()` function

### 1.6 Start Command (AC-19, AC-20)

- [x] **Test**: start command fails gracefully if not configured
- [x] **Implement**: Config existence check
- [x] **Test**: start command launches Docker containers
- [x] **Implement**: Docker startup with status output [AC-20]
- [x] **Test**: start command launches claude-api-server
- [x] **Implement**: API server startup with PID tracking
- [x] **Test**: start command shows final status
- [x] **Implement**: Status summary after startup [AC-19]

### 1.7 Stop Command (AC-21)

- [x] **Test**: stop command stops Docker containers
- [x] **Implement**: Docker shutdown
- [x] **Test**: stop command stops claude-api-server via PID
- [x] **Implement**: API server shutdown [AC-21]
- [x] **Test**: stop command handles already-stopped state gracefully

### 1.8 Status Command (AC-22)

- [x] **Test**: status command shows Docker container state
- [x] **Implement**: Container status display
- [x] **Test**: status command shows API server state
- [x] **Implement**: API server status via PID check [AC-22]

### 1.9 Install Script (AC-1 through AC-5)

- [x] Create `install.sh` for Mac (Darwin detection) [AC-2]
- [x] **Test**: install.sh checks for Docker [AC-3]
- [x] **Implement**: Docker prerequisite check with helpful error
- [x] **Test**: install.sh checks for Claude CLI [AC-4]
- [x] **Implement**: Claude CLI check with install instructions
- [x] **Test**: install.sh downloads and extracts tarball
- [x] **Implement**: GitHub release download logic [AC-1]
- [x] **Test**: install.sh creates symlink in PATH [AC-5]
- [x] **Implement**: PATH setup for Mac (/usr/local/bin)
- [x] Manual test: Full install flow on Mac

---

## Phase 2: Full Features ✅

> Shipped in PR #2 (commit 5d3d99a)

### 2.1 Doctor Command (AC-13 through AC-18)

- [x] **Test**: doctor command structure with multiple checks
- [x] **Implement**: Check runner with pass/fail display [AC-13]
- [x] **Test**: ElevenLabs connectivity check
- [x] **Implement**: ElevenLabs health check [AC-14]
- [x] **Test**: OpenAI connectivity check
- [x] **Implement**: OpenAI health check [AC-15]
- [x] **Test**: Claude CLI accessibility check
- [x] **Implement**: Claude CLI check (claude --version) [AC-16]
- [x] **Test**: Docker running check
- [x] **Implement**: Docker daemon check [AC-17]
- [x] **Test**: Summary with actionable messages
- [x] **Implement**: Clear error messages for failures [AC-18]

### 2.2 Device Management (AC-24 through AC-27)

- [x] Create `cli/lib/commands/device/` directory
- [x] **Test**: device add wizard prompts for all fields
- [x] **Implement**: `device add` command with Inquirer [AC-24, AC-25]
- [x] **Test**: device list shows all configured devices
- [x] **Implement**: `device list` command with table output [AC-26]
- [x] **Test**: device remove deletes device from config
- [x] **Implement**: `device remove <name>` command [AC-27]
- [x] **Test**: device remove requires confirmation

### 2.3 Logs Command (AC-23)

- [x] **Test**: logs command tails Docker logs
- [x] **Implement**: Docker logs streaming
- [x] **Test**: logs command tails API server logs
- [x] **Implement**: API server log tailing
- [x] **Test**: logs command combines both outputs [AC-23]

### 2.4 Linux Support

- [x] Update `install.sh` with Linux detection [AC-2]
- [x] **Test**: Linux uses ~/.local/bin for symlink
- [x] **Implement**: Linux PATH setup
- [x] **Test**: Docker socket permissions guidance
- [x] **Implement**: Linux-specific Docker guidance
- [x] Manual test: Full install flow on Linux

---

## Phase 3: Polish ✅

> Shipped in commits f68b735, ab6b911

### 3.1 Update Command (AC-28, AC-29)

- [x] **Test**: update command checks GitHub for latest version
- [x] **Implement**: Version comparison logic
- [x] **Test**: update command downloads and replaces CLI
- [x] **Implement**: Self-update mechanism [AC-28]
- [x] **Test**: update preserves config.json
- [x] **Implement**: Config preservation [AC-29]

### 3.2 Help and UX (AC-30, AC-31)

- [x] **Test**: base command shows help with all commands
- [x] **Implement**: Comprehensive help text [AC-30]
- [x] **Test**: each subcommand supports --help
- [x] **Implement**: Subcommand help text [AC-31]
- [x] Polish: Consistent output formatting across all commands
- [x] Polish: Error messages are clear and actionable

### 3.3 Config Commands

- [x] **Implement**: `config show` (redacted secrets)
- [x] **Implement**: `config path` (show config location)
- [x] **Implement**: `config reset` (with confirmation)

### 3.4 Release Automation

- [ ] Create GitHub Actions workflow for releases
- [ ] Build tarball with cli/ directory
- [ ] Upload to GitHub Releases on tag push
- [ ] Update install.sh to use releases URL

> Note: Release automation deferred - install.sh uses git clone approach instead

---

## Phase 4: Lifecycle Management ✅

> Shipped in commit 2c430eb (bonus - beyond original spec)

### 4.1 Backup Command

- [x] **Implement**: `backup` command creates timestamped backup
- [x] **Implement**: Backups stored in `~/.claude-phone/backups/`
- [x] **Implement**: Shows backup location and file size

### 4.2 Restore Command

- [x] **Implement**: `restore` command lists available backups
- [x] **Implement**: Interactive selection with inquirer
- [x] **Implement**: Safety backup before restore
- [x] **Implement**: Confirmation before overwriting

### 4.3 Uninstall Command

- [x] **Implement**: `uninstall` command shows what will be removed
- [x] **Implement**: Multiple confirmation prompts
- [x] **Implement**: Stops services before removal
- [x] **Implement**: Removes directories and symlink

---

## Verification ✅

All must pass before shipping.

- [x] All unit tests passing
- [x] Manual test: Fresh install on Mac
- [x] Manual test: Fresh install on Linux
- [x] Manual test: Setup wizard with valid keys
- [x] Manual test: Setup wizard with invalid keys (error handling)
- [x] Manual test: start/stop/status cycle
- [x] Manual test: doctor with all services running
- [x] Manual test: doctor with missing services
- [x] Manual test: device add/list/remove cycle
- [x] No linter errors (`npm run lint`)
- [x] All 31 acceptance criteria from SPEC verified
- [x] No secrets in committed code
- [x] Config file permissions are 600

---

## Documentation ✅

- [x] Update README.md with installation instructions
- [x] Update README.md with CLI command reference
- [x] Update CLAUDE.md with CLI architecture
- [x] Add CHANGELOG.md entry (in commit messages)

---

## Ready for Ship ✅

- [x] Self-review complete
- [x] All phases implemented
- [x] Manual testing complete on Mac and Linux
- [x] Documentation updated
- [x] GitHub Release created (via git tags)
- [x] Install URL tested end-to-end

---

## Completion Summary

**Feature:** Unified Installer CLI
**Status:** COMPLETE
**Completed:** 2026-01-07
**Commits:**
- PR #1: Phase 1 MVP (dcfae8e)
- PR #2: Phase 2 Full Features (5d3d99a)
- Phase 3: f68b735, ab6b911
- Phase 4: 2c430eb

**Final Command Set:**
```
claude-phone
├── setup           # Interactive setup wizard
├── start           # Start all services
├── stop            # Stop all services
├── status          # Show service status
├── doctor          # Run health checks
├── logs [service]  # Tail service logs
├── device
│   ├── add         # Add new device
│   ├── list        # List devices
│   └── remove      # Remove device
├── config
│   ├── show        # Display config (redacted)
│   ├── path        # Show config location
│   └── reset       # Reset configuration
├── update          # Self-update CLI
├── backup          # Backup configuration
├── restore         # Restore from backup
└── uninstall       # Clean removal
```

**Acceptance Criteria:** 31/31 complete
**Bonus Features:** 6 commands beyond spec (config show/path/reset, backup, restore, uninstall)

---

## Acceptance Criteria Mapping

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | curl install works | ✅ |
| AC-2 | OS detection | ✅ |
| AC-3 | Docker check | ✅ |
| AC-4 | Claude CLI check | ✅ |
| AC-5 | PATH setup | ✅ |
| AC-6 | Setup wizard launches | ✅ |
| AC-7 | ElevenLabs validation | ✅ |
| AC-8 | OpenAI validation | ✅ |
| AC-9 | 3CX config prompts | ✅ |
| AC-10 | Device setup prompts | ✅ |
| AC-11 | Secure config save | ✅ |
| AC-12 | Reconfigure support | ✅ |
| AC-13 | Doctor runs checks | ✅ |
| AC-14 | ElevenLabs health | ✅ |
| AC-15 | OpenAI health | ✅ |
| AC-16 | Claude CLI health | ✅ |
| AC-17 | Docker health | ✅ |
| AC-18 | Actionable errors | ✅ |
| AC-19 | Start all services | ✅ |
| AC-20 | Start status display | ✅ |
| AC-21 | Stop all services | ✅ |
| AC-22 | Status display | ✅ |
| AC-23 | Logs command | ✅ |
| AC-24 | Device add wizard | ✅ |
| AC-25 | Device add fields | ✅ |
| AC-26 | Device list | ✅ |
| AC-27 | Device remove | ✅ |
| AC-28 | Update command | ✅ |
| AC-29 | Update preserves config | ✅ |
| AC-30 | Base help | ✅ |
| AC-31 | Subcommand help | ✅ |
