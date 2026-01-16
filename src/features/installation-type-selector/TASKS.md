# Tasks: Installation Type Selector

## Implementation Checklist

### Phase 1: Config Schema Update (AC6)

- [ ] **1.1** Update `cli/lib/config.js`
  - [ ] Add `installationType` to DEFAULT_CONFIG
  - [ ] Default value: `'both'`
  - [ ] Valid values: `'voice-server'`, `'api-server'`, `'both'`
  - [ ] Add `getInstallationType()` helper function
  - [ ] Ensure backward compatibility (missing field = 'both')

### Phase 2: Installation Type Prompt (AC1)

- [ ] **2.1** Create type prompt in `cli/lib/commands/setup.js`
  - [ ] Add `promptInstallationType(currentType)` function
  - [ ] Three choices with clear descriptions
  - [ ] Show current type as default on re-run
  - [ ] Return selected type

- [ ] **2.2** Add type descriptions
  - [ ] Voice Server: "Handles calls, needs Docker"
  - [ ] API Server: "Claude Code wrapper, minimal setup"
  - [ ] Both: "Full stack on one machine"

### Phase 3: Conditional Prereq Checks (AC5)

- [ ] **3.1** Modify `cli/lib/prereqs.js`
  - [ ] Add `type` parameter to `runPrereqChecks(options)`
  - [ ] Create `getChecksForType(type)` function
  - [ ] API Server: Only Node.js check
  - [ ] Voice Server: Node.js, Docker, Compose, Disk
  - [ ] Both: All checks
  - [ ] Add 'minimal' type for initial Node.js-only check

- [ ] **3.2** Update check result messages
  - [ ] Show which checks are being run
  - [ ] Indicate type-specific checks

### Phase 4: Setup Flow Refactor (AC2, AC3, AC4)

- [ ] **4.1** Refactor main setup flow in `cli/lib/commands/setup.js`
  - [ ] Run minimal prereq check first (Node.js only)
  - [ ] Prompt for installation type
  - [ ] Run type-specific prereq checks
  - [ ] Route to type-specific setup function

- [ ] **4.2** Create `setupApiServer(config)` function (AC3)
  - [ ] Only ask for API server port
  - [ ] Default port: 3333
  - [ ] Skip SIP, keys, devices
  - [ ] Return updated config

- [ ] **4.3** Create `setupVoiceServer(config)` function (AC2)
  - [ ] Call `setupSBC()` for 3CX config
  - [ ] Ask for API server IP address
  - [ ] Ask for API server port
  - [ ] Call `setupApiKeys()` for ElevenLabs, OpenAI
  - [ ] Call `setupDevices()` for device config
  - [ ] Call `writeDockerConfig()`
  - [ ] Return updated config

- [ ] **4.4** Update `setupBoth(config)` function (AC4)
  - [ ] Preserve current full setup flow
  - [ ] This is the default behavior
  - [ ] All questions asked

- [ ] **4.5** Save installation type to config
  - [ ] Set `config.installationType` before saving
  - [ ] Persist to config.json

### Phase 5: Start Command Update (AC7)

- [ ] **5.1** Modify `cli/lib/commands/start.js`
  - [ ] Load config and get installation type
  - [ ] Create `startApiServer()` function
  - [ ] Create `startVoiceServer()` function
  - [ ] Route based on type

- [ ] **5.2** Implement type-specific start logic
  - [ ] API Server: Start only claude-api-server
  - [ ] Voice Server: Check API reachability, start Docker
  - [ ] Both: Start API server, then Docker

- [ ] **5.3** Update success messages
  - [ ] Show type-appropriate completion message
  - [ ] List only started services

### Phase 6: Stop Command Update (AC7)

- [ ] **6.1** Modify `cli/lib/commands/stop.js`
  - [ ] Load config and get installation type
  - [ ] Create `stopApiServer()` function
  - [ ] Create `stopVoiceServer()` function
  - [ ] Route based on type

- [ ] **6.2** Implement type-specific stop logic
  - [ ] API Server: Stop only claude-api-server
  - [ ] Voice Server: Stop Docker containers
  - [ ] Both: Stop both

### Phase 7: Status Command Update (AC7)

- [ ] **7.1** Modify `cli/lib/commands/status.js`
  - [ ] Load config and get installation type
  - [ ] Show installation type in header
  - [ ] Create `showApiServerStatus()` function
  - [ ] Create `showVoiceServerStatus()` function

- [ ] **7.2** Implement type-specific status display
  - [ ] API Server: Only API server status
  - [ ] Voice Server: Docker, SIP, API reachability
  - [ ] Both: All status info

### Phase 8: Doctor Command Update (AC9)

- [ ] **8.1** Modify `cli/lib/commands/doctor.js`
  - [ ] Load config and get installation type
  - [ ] Show installation type in header
  - [ ] Filter health checks by type

- [ ] **8.2** Implement type-specific health checks
  - [ ] API Server: API server health endpoint
  - [ ] Voice Server: Docker, containers, SIP registration, API reachability
  - [ ] Both: All health checks

### Phase 9: Re-run Setup Handling (AC8)

- [ ] **9.1** Handle existing config in setup
  - [ ] Load existing config if present
  - [ ] Show current type as default in prompt
  - [ ] Allow changing installation type
  - [ ] Warn if changing type (may need reconfiguration)

- [ ] **9.2** Type change handling
  - [ ] If changing to API Server: Warn about Docker config removal
  - [ ] If changing to Voice Server: Need to configure API server connection
  - [ ] Preserve compatible settings when changing

### Phase 10: Final Integration & Testing

- [ ] **10.1** Integration testing
  - [ ] Test fresh install for each type
  - [ ] Test re-run setup for each type
  - [ ] Test type change scenarios
  - [ ] Test start/stop/status/doctor for each type

- [ ] **10.2** Backward compatibility testing
  - [ ] Existing config without installationType
  - [ ] Verify defaults to 'both'
  - [ ] All existing functionality preserved

- [ ] **10.3** Documentation
  - [ ] Update CLAUDE.md with feature completion
  - [ ] Update README.md if needed

## Acceptance Criteria Mapping

| AC | Task(s) |
|----|---------|
| AC1 | 2.1, 2.2 |
| AC2 | 4.3 |
| AC3 | 4.2 |
| AC4 | 4.4 |
| AC5 | 3.1, 3.2 |
| AC6 | 1.1 |
| AC7 | 5.1, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2 |
| AC8 | 9.1, 9.2 |
| AC9 | 8.1, 8.2 |

## Estimated Effort

| Phase | Tasks | Complexity |
|-------|-------|------------|
| 1. Config Schema | 1 | Low |
| 2. Type Prompt | 2 | Low |
| 3. Conditional Prereqs | 2 | Medium |
| 4. Setup Refactor | 5 | High |
| 5. Start Command | 3 | Medium |
| 6. Stop Command | 2 | Low |
| 7. Status Command | 2 | Low |
| 8. Doctor Command | 2 | Low |
| 9. Re-run Handling | 2 | Medium |
| 10. Testing | 3 | Medium |

**Total: 24 tasks across 10 phases**
