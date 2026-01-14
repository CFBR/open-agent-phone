# SBC Simplified Installer Implementation Plan

> HOW to build what the spec defined. Technical decisions and architecture.

**Spec:** ./SPEC.md
**Status:** REVIEW

---

## Technical Approach

### Architecture Decision

Modify the existing setup.js to consolidate the SIP configuration step. Instead of two questions (domain + registrar IP), we ask for 3CX FQDN only and derive registrar from it. Add a new SBC Auth Key field for documentation purposes.

### Key Technical Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config structure | Add `sip.sbcAuthKey`, keep `sip.domain`, derive `sip.registrar` | Backwards compatible, SBC Auth Key is informational |
| Port detection | Keep existing `detect3cxSbc()` | Already works, proven in Pi deployment |
| TUI order | SBC → API → Device → Mac | Logical flow: connection first, then services |

## Dependencies

### External

- inquirer (existing) - TUI prompts
- ora (existing) - spinners
- chalk (existing) - colored output

### Internal

- `cli/lib/validators.js` - Add `validateSbcAuthKey()`
- `cli/lib/commands/setup.js` - Main changes
- `cli/lib/docker.js` - Update .env generation
- `cli/lib/config.js` - Config schema unchanged

### Blockers

- [ ] None - can start immediately

## Data Model

### Config Schema Changes

```javascript
// ~/.claude-phone/config.json
{
  "sip": {
    "domain": "mycompany.3cx.us",      // 3CX FQDN (existing)
    "registrar": "mycompany.3cx.us",   // Set to same as domain (changed)
    "sbcAuthKey": "abc123...",         // NEW - SBC Auth Key for reference
    "transport": "udp"                  // (existing)
  }
  // ... rest unchanged
}
```

### Migration

Existing configs continue to work. On next `setup`, registrar is set to domain automatically.

## API / Interface

### Modified Functions

```javascript
// cli/lib/commands/setup.js

// REMOVE: setupSIP() dual question flow
// ADD: setupSBC() single question flow

async function setupSBC(config) {
  // Step 1: 3CX FQDN
  // Step 2: SBC Auth Key (informational)
  // Auto-set: registrar = domain
  return config;
}
```

### New Validators

```javascript
// cli/lib/validators.js

function validateSbcAuthKey(key) {
  // Non-empty string, alphanumeric + dashes
  return /^[a-zA-Z0-9-]+$/.test(key);
}
```

## Test Strategy

### Unit Tests

This is a CLI tool without a formal test suite. Verification is manual:

- [ ] Run `claude-phone setup` on Pi - verify new flow
- [ ] Run `claude-phone setup` on Mac - verify unchanged flow (standard mode)
- [ ] Check generated .env has correct SIP_DOMAIN and SIP_REGISTRAR
- [ ] Check config.json has sbcAuthKey field

### Integration Tests

- [ ] Full Pi setup → `claude-phone start` → make test call
- [ ] Verify SBC registration works with simplified config

### What NOT to Test

- 3CX SBC provisioning (manual, out of scope)
- ElevenLabs/OpenAI API validation (unchanged)

## Implementation Notes

### Files to Modify

| File | Changes |
|------|---------|
| `cli/lib/commands/setup.js` | Replace `setupSIP()` with `setupSBC()` for Pi mode |
| `cli/lib/validators.js` | Add `validateSbcAuthKey()` |
| `cli/lib/docker.js` | Update .env generation comments |

### TUI Flow Comparison

**BEFORE (Current):**
```
☎️  SIP Configuration
  3CX domain (e.g., your-3cx.3cx.us): ____
  3CX registrar IP (e.g., 192.168.1.100): ____  ← CONFUSING
```

**AFTER (Simplified):**
```
📡 3CX SBC Connection
  ℹ️  Pre-requisite: Create SBC in 3CX Admin → Settings → SBC

  3CX FQDN (e.g., mycompany.3cx.us): ____
  SBC Auth Key ID (from 3CX admin): ____
```

### Gotchas

- **Mac mode (standard):** Should NOT use new SBC flow - Mac connects directly without SBC
- **Pi mode only:** Uses simplified SBC flow
- The setupSIP() function should remain for Mac standard mode, but Pi mode uses setupSBC()

### Security Considerations

- SBC Auth Key stored with other secrets (chmod 600)
- Displayed masked in `claude-phone config show`

---

## Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Morpheus | 2026-01-14 | |
| Tech Reviewer | Chuck | | Pending |

**Approved for Implementation:** [ ] Yes
