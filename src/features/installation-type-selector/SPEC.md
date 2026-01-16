# Feature: Installation Type Selector

## Overview
Add a prompt at the start of `claude-phone setup` (after prereq checks) that asks users what type of installation they're performing. This allows the setup wizard to show only relevant configuration questions for their deployment type.

## User Story
As a user installing claude-phone, I want to specify whether I'm setting up a Voice Server, API Server, or Both, so I only see the configuration questions relevant to my deployment.

## Background

Claude Phone supports split-mode deployment:
- **Voice Server** runs on Pi/Linux with Docker (drachtio, FreeSWITCH, voice-app)
- **API Server** runs on a machine with Claude Code CLI (wraps Claude for voice queries)
- **Both** runs everything on one machine (all-in-one deployment)

Currently, `claude-phone setup` always asks all questions, which is confusing when:
- Pi user doesn't need API server questions
- API server user doesn't need SIP/device config
- Users don't know which questions apply to them

## Requirements

### Installation Types

| Type | What it installs | Questions to ask |
|------|------------------|------------------|
| **Voice Server** | Docker containers (drachtio, FreeSWITCH, voice-app) | 3CX FQDN, API server IP, ElevenLabs key, OpenAI key, device config |
| **API Server** | claude-api-server process | Claude API port (default 3333), that's it |
| **Both** | Everything | All questions (current behavior) |

### Prerequisite Requirements by Type

| Type | Node.js | Docker | Docker Compose | Network |
|------|---------|--------|----------------|---------|
| Voice Server | ✅ | ✅ | ✅ | ✅ |
| API Server | ✅ | ❌ | ❌ | ❌ |
| Both | ✅ | ✅ | ✅ | ✅ |

## Acceptance Criteria

### AC1: Type Selection Prompt
- [ ] After prereq checks pass, show installation type prompt
- [ ] Three options: Voice Server, API Server, Both
- [ ] Clear descriptions for each option
- [ ] Default to "Both" for backward compatibility

### AC2: Voice Server Flow
- [ ] Skip API server config questions
- [ ] Ask: 3CX FQDN (SBC mode)
- [ ] Ask: API server IP address
- [ ] Ask: ElevenLabs API key
- [ ] Ask: OpenAI API key
- [ ] Ask: Device configuration (extension, voice, prompt)
- [ ] Generate Docker config and .env
- [ ] Don't create/manage claude-api-server

### AC3: API Server Flow
- [ ] Skip SIP/3CX configuration
- [ ] Skip ElevenLabs/OpenAI keys
- [ ] Skip device configuration
- [ ] Ask: API server port (default 3333)
- [ ] Only configure claude-api-server
- [ ] `claude-phone start` only starts API server
- [ ] `claude-phone stop` only stops API server

### AC4: Both Flow (All-in-One)
- [ ] Current behavior - ask all questions
- [ ] Configure both Voice Server and API Server
- [ ] `claude-phone start` starts everything
- [ ] This is the default selection

### AC5: Prereq Check Adjustment
- [ ] API Server type: Only check Node.js (skip Docker checks)
- [ ] Voice Server type: Check Node.js, Docker, Compose
- [ ] Both type: Check everything
- [ ] Run type-appropriate checks AFTER user selects type

### AC6: Config Storage
- [ ] Store installation type in config.json
- [ ] Format: `{ "installationType": "voice-server" | "api-server" | "both" }`
- [ ] Subsequent commands respect this setting

### AC7: Start/Stop Respect Type
- [ ] `claude-phone start` starts only relevant services
- [ ] `claude-phone stop` stops only relevant services
- [ ] `claude-phone status` shows only relevant services

### AC8: Re-run Setup
- [ ] Running setup again shows current type as default
- [ ] User can change installation type
- [ ] Changing type reconfigures appropriately

### AC9: Doctor Command
- [ ] `claude-phone doctor` checks only relevant services
- [ ] API Server: Only check API server health
- [ ] Voice Server: Check Docker, SIP registration, API server reachability
- [ ] Both: Check everything

## UI/UX Flow

### Fresh Install
```
$ claude-phone setup

🔍 Checking prerequisites...
  ✓ Node.js v20.11.0 (requires ≥18)

📦 Installation Type
? What are you installing?
  ❯ Voice Server (Pi/Linux) - Handles calls, needs Docker
    API Server - Claude Code wrapper, minimal setup
    Both (all-in-one) - Full stack on one machine

You selected: Voice Server

🔍 Checking additional prerequisites for Voice Server...
  ✓ Docker v24.0.7
  ✓ Docker Compose v2.21.0 (plugin)
  ✓ Disk space 45GB free (requires ≥2GB)

☎️ SIP Configuration (Voice Server)
? 3CX FQDN: mycompany.3cx.us

🖥️ API Server Connection
? API Server IP address: 10.77.14.30
? API Server port: 3333

[... continues with voice-specific questions ...]
```

### API Server Only
```
$ claude-phone setup

🔍 Checking prerequisites...
  ✓ Node.js v20.11.0 (requires ≥18)

📦 Installation Type
? What are you installing?
    Voice Server (Pi/Linux) - Handles calls, needs Docker
  ❯ API Server - Claude Code wrapper, minimal setup
    Both (all-in-one) - Full stack on one machine

You selected: API Server

🖥️ API Server Configuration
? API server port (default 3333): 3333

✅ Setup complete!

To start the API server:
  claude-phone start

The API server will listen on port 3333.
Voice servers can connect to: http://YOUR_IP:3333
```

## Technical Notes

### Config Structure Update
```json
{
  "installationType": "voice-server",
  "server": {
    "httpPort": 3000,
    "claudeApiPort": 3333,
    "externalIp": "auto"
  },
  "sip": { ... },
  "devices": [ ... ],
  "api": { ... }
}
```

### Files to Modify
- `cli/lib/commands/setup.js` - Add type selector, conditional flows
- `cli/lib/commands/start.js` - Respect installation type
- `cli/lib/commands/stop.js` - Respect installation type
- `cli/lib/commands/status.js` - Show type-appropriate status
- `cli/lib/commands/doctor.js` - Type-appropriate health checks
- `cli/lib/prereqs.js` - Conditional prereq checks based on type
- `cli/lib/config.js` - Add installationType field

### Backward Compatibility
- Existing configs without `installationType` default to "both"
- All current functionality preserved for "both" type
- No breaking changes to existing installations

## Out of Scope
- Automatic detection of installation type
- Migration between types (manual reconfigure)
- Mixed configurations (e.g., some Docker services but not others)
