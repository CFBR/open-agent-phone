# Feature Spec: Unified Installer

## Overview

Transform Claude Phone from a multi-component, manual-setup project into a single-command installable CLI tool. Users install via `curl | bash`, run an interactive setup wizard to configure API keys and 3CX credentials, then start everything with `claude-phone start`. Compatible with Mac and Linux.

## Problem Statement

Currently, Claude Phone requires:
1. Cloning the repo
2. Setting up Docker for voice-app
3. Manually running claude-api-server on the host
4. Editing .env files by hand
5. Understanding the split architecture

This complexity creates a high barrier to entry for homelabbers and developers who want to experiment with voice AI.

## Target Users

**Primary:** Developers and homelabbers comfortable with CLI tools and Docker, but wanting a streamlined setup experience. Technical enough to configure 3CX, but shouldn't need to understand Claude Phone's internals.

## User Stories

1. **As a developer**, I want to install Claude Phone with a single command, so I can get started quickly without cloning repos or managing dependencies.

2. **As a homelabber**, I want an interactive setup wizard that guides me through entering my API keys and 3CX config, so I don't have to hunt through documentation.

3. **As a user**, I want to validate my configuration before going live, so I know everything is connected properly.

4. **As a user**, I want to start and stop Claude Phone with simple commands, so I don't have to manage multiple processes manually.

5. **As a user**, I want to add multiple SIP devices (extensions) with different voices and prompts, so I can have specialized AI personalities.

6. **As a user**, I want to update Claude Phone easily when new versions are released.

## Acceptance Criteria

> **Status: ✅ ALL COMPLETE (2026-01-07)**

### Installation

- [x] **AC-1**: Running `curl -fsSL https://install.claude-phone.com | bash` (or similar) downloads and installs the `claude-phone` CLI globally
- [x] **AC-2**: Install script detects OS (Mac/Linux) and installs appropriate binaries
- [x] **AC-3**: Install script verifies Docker is installed and running, exits with helpful message if not
- [x] **AC-4**: Install script verifies Claude Code CLI is installed, provides install instructions if missing
- [x] **AC-5**: After install, `claude-phone` command is available in PATH

### Setup Wizard

- [x] **AC-6**: `claude-phone setup` launches interactive wizard
- [x] **AC-7**: Wizard prompts for ElevenLabs API key with validation (test API call)
- [x] **AC-8**: Wizard prompts for OpenAI API key with validation (test API call)
- [x] **AC-9**: Wizard prompts for 3CX configuration: SIP domain, registrar IP, extension, auth ID, password
- [x] **AC-10**: Wizard prompts for first device setup: name, voice ID, system prompt
- [x] **AC-11**: Wizard saves configuration securely (appropriate file permissions)
- [x] **AC-12**: Wizard can be re-run to update configuration

### Validation

- [x] **AC-13**: `claude-phone doctor` runs full health check
- [x] **AC-14**: Doctor validates ElevenLabs API connectivity
- [x] **AC-15**: Doctor validates OpenAI API connectivity
- [x] **AC-16**: Doctor validates Claude Code CLI is accessible
- [x] **AC-17**: Doctor validates Docker is running
- [x] **AC-18**: Doctor reports clear pass/fail for each check with actionable error messages

### Start/Stop

- [x] **AC-19**: `claude-phone start` launches all required services (voice-app container, claude-api-server)
- [x] **AC-20**: Start command shows status of each component coming up
- [x] **AC-21**: `claude-phone stop` cleanly shuts down all services
- [x] **AC-22**: `claude-phone status` shows running state of all components
- [x] **AC-23**: `claude-phone logs` tails combined logs from all services

### Device Management

- [x] **AC-24**: `claude-phone device add` launches interactive device wizard
- [x] **AC-25**: Device wizard prompts for: name, SIP extension, auth credentials, ElevenLabs voice ID, system prompt
- [x] **AC-26**: `claude-phone device list` shows all configured devices
- [x] **AC-27**: `claude-phone device remove <name>` removes a device configuration

### Updates

- [x] **AC-28**: `claude-phone update` downloads and installs latest version
- [x] **AC-29**: Update preserves existing configuration

### Help

- [x] **AC-30**: `claude-phone` with no args shows help with all available commands
- [x] **AC-31**: Each subcommand supports `--help` flag

## Technical Constraints

1. **Claude Code CLI dependency**: claude-api-server MUST run on the host (not in Docker) to access the locally installed Claude Code CLI
2. **Docker required**: voice-app runs in Docker with host networking for RTP
3. **Mac and Linux only**: Windows is out of scope
4. **Node.js**: Existing codebase is Node.js, maintain consistency
5. **User-chosen voices**: No hardcoded ElevenLabs voice IDs, user specifies during setup

## Out of Scope

- Web-based admin UI
- Windows support
- Automatic 3CX PBX configuration
- Multiple simultaneous Claude sessions per device
- Call recording in this feature (future enhancement)

## Decisions (Resolved)

1. **Install URL**: GitHub raw URL - `curl -fsSL https://raw.githubusercontent.com/networkchuck/claude-phone/main/install.sh | bash`
2. **Config location**: `~/.claude-phone/` - dedicated directory, easy to find and backup
3. **Process management**: Simple background process with PID file at `~/.claude-phone/server.pid` - minimal dependencies

## Success Metrics

- User can go from zero to working Claude Phone in under 10 minutes
- Setup wizard catches 90%+ of configuration errors before first call attempt
- Single `claude-phone start` successfully launches all components

## Dependencies

- Docker and Docker Compose
- Claude Code CLI (user's existing installation)
- Node.js runtime
- ElevenLabs account (user provides key)
- OpenAI account (user provides key)
- 3CX PBX (user configures separately)
