# SBC Simplified Installer Specification

> Agree on WHAT before HOW. This document defines success criteria before any code is written.

## Overview

Simplify the claude-phone installer to use a single deployment model: **SBC-everywhere**. Instead of asking users whether they're using cloud or on-prem 3CX, the installer assumes all deployments use the 3CX SBC on the Raspberry Pi. This reduces installer complexity, eliminates confusing questions about "registrar IP", and provides a consistent experience for all users regardless of their 3CX deployment type.

## User Stories

### Primary

- As a user with free-tier 3CX cloud, I want to set up claude-phone on my Pi so I can answer calls with my AI assistant
- As a user with self-hosted 3CX, I want the same simple setup experience as cloud users

### Secondary

- As a first-time user, I want clear instructions on what credentials I need from 3CX before running setup
- As a returning user, I want to update my configuration without re-entering everything

## Acceptance Criteria

### Core Functionality

- [ ] AC1: Setup asks for 3CX FQDN (e.g., `mycompany.3cx.us`) - single hostname question
- [ ] AC2: Setup asks for SBC Auth Key ID from 3CX admin panel
- [ ] AC3: Setup does NOT ask for "registrar IP" (removed)
- [ ] AC4: Setup auto-detects if 3CX SBC process is running on port 5060
- [ ] AC5: If SBC detected on 5060, drachtio uses port 5070 (already working)
- [ ] AC6: Generated .env includes `SIP_DOMAIN` and `SIP_REGISTRAR` both set to 3CX FQDN
- [ ] AC7: Generated .env includes `SBC_AUTH_KEY` for reference (even if SBC is manually configured)
- [ ] AC8: Setup displays clear pre-requisites message about manual SBC provisioning

### TUI Flow

- [ ] AC9: Step 1 is "3CX SBC Connection" (FQDN + Auth Key)
- [ ] AC10: Step 2 is "API Keys" (ElevenLabs, OpenAI) - unchanged
- [ ] AC11: Step 3 is "Device Configuration" (name, extension, authId, password, voiceId, prompt) - unchanged
- [ ] AC12: Step 4 is "Mac Connection" (Mac IP, Claude API port) - unchanged
- [ ] AC13: Final summary includes reminder to manually provision SBC in 3CX admin

### Error States

- [ ] AC14: If 3CX FQDN is invalid hostname format, show validation error
- [ ] AC15: If SBC Auth Key is empty, show validation error
- [ ] AC16: If SBC detection fails (port check error), gracefully fall back to manual prompt

### Backwards Compatibility

- [ ] AC17: Existing configs with `sip.registrar` set continue to work
- [ ] AC18: Config migration sets `sip.registrar` = `sip.domain` for SBC mode

## Constraints

### Technical

- Must work with existing docker-compose.yml generation
- Must work with existing multi-registrar.js (voice-app connects to local SBC, not remote 3CX)
- SBC handles actual connection to 3CX - voice-app just registers with local SBC

### Performance

- Setup wizard should complete in under 2 minutes
- Port detection should timeout after 3 seconds

### Security

- SBC Auth Key stored in ~/.claude-phone/config.json (chmod 600)
- Auth Key displayed masked in `config show` output

## Out of Scope

- Automatic SBC provisioning in 3CX (user must do this manually via 3CX admin)
- SBC installation automation (user follows 3CX Pi install docs)
- Multiple 3CX instance support
- Non-Pi deployments (Mac-only mode remains unchanged)

## Open Questions

- [x] Should we store SBC Auth Key in config? → Yes, for reference/re-setup, but SBC reads from /etc/3cxsbc.conf
- [x] Should we validate SBC is actually provisioned? → No, too complex - user handles manually

---

## Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Morpheus | 2026-01-14 | |
| Reviewer | Chuck | | Pending |

**Status:** REVIEW
