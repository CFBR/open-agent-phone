# SBC Simplified Installer Tasks

> Execution checklist. Tasks derived from approved SPEC and PLAN.

**Spec:** ./SPEC.md (APPROVED)
**Plan:** ./PLAN.md (APPROVED)
**Status:** NOT STARTED

---

## Pre-Implementation

- [x] SPEC.md reviewed and approved
- [x] PLAN.md reviewed and approved
- [x] All open questions from SPEC resolved
- [x] All blockers from PLAN cleared
- [ ] Feature branch created: `feature/sbc-simplified-installer`

---

## Implementation

### Task 1: Add SBC Auth Key Validator

**File:** `cli/lib/validators.js`

- [ ] Add `validateSbcAuthKey(key)` function
- [ ] Validate non-empty, alphanumeric + dashes allowed
- [ ] Export from module

### Task 2: Create setupSBC() Function

**File:** `cli/lib/commands/setup.js`

- [ ] Create new `setupSBC(config)` async function
- [ ] Display pre-requisite info box about manual SBC provisioning
- [ ] Prompt for 3CX FQDN with validateHostname
- [ ] Prompt for SBC Auth Key ID with validateSbcAuthKey
- [ ] Set `config.sip.domain` = FQDN
- [ ] Set `config.sip.registrar` = FQDN (same value)
- [ ] Set `config.sip.sbcAuthKey` = Auth Key
- [ ] Return updated config

### Task 3: Update Pi Setup Flow

**File:** `cli/lib/commands/setup.js`

- [ ] In `setupPi()`, replace `setupSIP(config)` call with `setupSBC(config)`
- [ ] Update step header from "☎️ SIP Configuration" to "📡 3CX SBC Connection"
- [ ] Ensure Mac `setupStandard()` still uses `setupSIP()` (unchanged)

### Task 4: Update .env Generation

**File:** `cli/lib/docker.js`

- [ ] In `generateEnvFile()`, ensure SIP_DOMAIN and SIP_REGISTRAR use config.sip.domain
- [ ] Add comment about SBC_AUTH_KEY for reference (not used by voice-app)
- [ ] Verify port 5070 logic still works when SBC detected

### Task 5: Update Final Summary

**File:** `cli/lib/commands/setup.js`

- [ ] Update Pi setup completion message
- [ ] Add reminder about manual SBC provisioning in 3CX admin
- [ ] Include link to 3CX SBC docs

---

## Verification

### Acceptance Criteria Checklist

- [ ] AC1: Setup asks for 3CX FQDN
- [ ] AC2: Setup asks for SBC Auth Key ID
- [ ] AC3: Setup does NOT ask for "registrar IP"
- [ ] AC4: Auto-detects 3CX SBC on port 5060
- [ ] AC5: Uses port 5070 if SBC detected
- [ ] AC6: .env has SIP_DOMAIN and SIP_REGISTRAR set to FQDN
- [ ] AC7: .env includes SBC_AUTH_KEY reference
- [ ] AC8: Pre-requisites message displayed
- [ ] AC9: Step 1 is "3CX SBC Connection"
- [ ] AC10-12: Steps 2-4 unchanged
- [ ] AC13: Final summary includes SBC reminder
- [ ] AC14: FQDN validation works
- [ ] AC15: Auth Key validation works
- [ ] AC16: Graceful fallback on port detection failure
- [ ] AC17: Existing configs continue to work
- [ ] AC18: Migration sets registrar = domain

### Code Quality

- [ ] No linter errors (`npm run lint`)
- [ ] No new dependencies added
- [ ] Code style matches existing patterns

---

## Manual Testing

- [ ] Run `claude-phone setup` on Pi
- [ ] Verify new TUI flow (SBC → API → Device → Mac)
- [ ] Run `claude-phone start` on Pi
- [ ] Make test call to extension
- [ ] Verify call connects and AI responds

---

## Documentation

- [ ] Update CLAUDE.md with feature completion
- [ ] Code comments for new functions

---

## Ready for Review

- [ ] Self-review complete
- [ ] Ready for `/feature ship`

---

## Notes

[To be filled during implementation]
