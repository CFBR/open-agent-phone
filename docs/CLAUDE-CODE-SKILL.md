# Claude Code Call Skill

A Claude Code skill that enables voice calling from your AI assistant. Say "call me when done" and your AI will actually call you.

## Overview

This skill wraps the Claude Phone outbound API, allowing natural language commands like:
- "Call me when the backup finishes"
- "Have Cephanie call me about disk usage"
- "Call me and let's discuss the results"

## Skill Structure

```
~/.claude/skills/Call/
├── SKILL.md              # Skill definition and routing
├── bin/
│   └── call              # CLI entry point
├── lib/
│   └── api.py            # API client library
└── workflows/
    └── MakeCall.md       # Step-by-step workflow
```

## Installation

1. Create the skill directory:
```bash
mkdir -p ~/.claude/skills/Call/{bin,lib,workflows}
```

2. Copy the files below into place

3. Make the CLI executable:
```bash
chmod +x ~/.claude/skills/Call/bin/call
```

4. Update the `API_BASE_URL` in `lib/api.py` to point to your Claude Phone server

## Configuration

Edit `lib/api.py` to configure:

```python
# Your Claude Phone server
API_BASE_URL = "http://YOUR_SERVER:3000"

# Contact directory - map names to numbers
CONTACTS = {
    "me": "YOUR_EXTENSION",
    "myself": "YOUR_EXTENSION",
    # Add more contacts...
}

# Device registry - AI personalities
DEVICES = {
    "morpheus": {
        "name": "Morpheus",
        "extension": "9000",
        "description": "Principal AI assistant"
    },
    # Add more devices...
}
```

---

## SKILL.md

```markdown
---
name: Call
description: Outbound voice calling via SIP. USE WHEN user says call me, phone me, ring me, notify by phone, or wants the server to call them.
---

# Call Skill

Initiate outbound phone calls to deliver voice messages OR start two-way conversations.

## Call Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **announce** | One-way: Plays message, then hangs up | Notifications, alerts |
| **conversation** | Two-way: Plays message, then conversation | Complex updates, Q&A |

## CLI Usage

```bash
# Basic call
call outbound me --message "Your backup is complete"

# With specific device personality
call outbound me --message "Storage alert!" --device Cephanie

# Conversation mode
call outbound me --message "Let's discuss" --mode conversation

# List devices
call devices
```

## Workflow Routing

| Trigger | Workflow |
|---------|----------|
| "call me", "phone me", "notify by call" | MakeCall |

## Contact Directory

| Name | Aliases | Number |
|------|---------|--------|
| Me | me, myself | YOUR_EXTENSION |

## Device Directory

| Device | Extension | Voice | Description |
|--------|-----------|-------|-------------|
| **Morpheus** | 9000 | Male | Default assistant |
| **Cephanie** | 9002 | Female | Storage server personality |

## Examples

**Call when task completes:**
```
User: "Run this script and call me when it's done"
→ Executes script, then calls with status update
```

**Call with conversation:**
```
User: "Call me and let's discuss the test results"
→ Calls in conversation mode, you can ask follow-up questions
```

**Device-specific call:**
```
User: "Have Cephanie call me about disk usage"
→ Cephanie's voice delivers the message
```
```

---

## lib/api.py

```python
"""
Voice API Client
HTTP wrapper for the outbound call API
"""

import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any

# ============================================================
# CONFIGURATION - Update these for your setup
# ============================================================

API_BASE_URL = "http://YOUR_SERVER:3000"
DEFAULT_CALLER_ID = "9000"
TIMEOUT_SECONDS = 30

# Contact Directory - Map names/aliases to phone numbers
CONTACTS = {
    "me": "YOUR_EXTENSION",
    "myself": "YOUR_EXTENSION",
    # Add your contacts here:
    # "wife": "+15551234567",
    # "office": "5000",
}

# Device Registry - AI personalities
DEVICES = {
    "morpheus": {
        "name": "Morpheus",
        "extension": "9000",
        "description": "Principal AI assistant"
    },
    "cephanie": {
        "name": "Cephanie",
        "extension": "9002",
        "description": "Storage server (sassy personality)"
    },
}

DEFAULT_DEVICE = "Morpheus"

# ============================================================
# EXCEPTIONS
# ============================================================

class VoiceAPIError(Exception):
    """Base exception for Voice API errors"""
    def __init__(self, error: str, message: str, data: Optional[Dict] = None):
        self.error = error
        self.message = message
        self.data = data or {}
        super().__init__(message)

class ContactNotFoundError(VoiceAPIError):
    pass

class ServiceUnavailableError(VoiceAPIError):
    pass

class CallFailedError(VoiceAPIError):
    pass

class DeviceNotFoundError(VoiceAPIError):
    pass

# ============================================================
# CONTACT RESOLUTION
# ============================================================

def resolve_contact(target: str) -> str:
    """Resolve a contact name/alias to a phone number."""
    target_lower = target.lower().strip()

    # Check contact directory
    if target_lower in CONTACTS:
        return CONTACTS[target_lower]

    # Check if it's already a valid phone number
    cleaned = target.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

    # E.164 format: +[digits]
    if cleaned.startswith("+") and cleaned[1:].isdigit() and len(cleaned) > 2:
        return cleaned

    # Extension or dial string
    if cleaned.isdigit() and 1 <= len(cleaned) <= 15:
        return cleaned

    raise ContactNotFoundError(
        error="contact_not_found",
        message=f"Unknown contact: {target}"
    )

def resolve_device(device: Optional[str]) -> str:
    """Resolve device name to canonical form."""
    if device is None or device.strip() == "":
        return DEFAULT_DEVICE

    device_lower = device.lower().strip()

    if device_lower in DEVICES:
        return DEVICES[device_lower]["name"]

    available = ', '.join(d['name'] for d in DEVICES.values())
    raise DeviceNotFoundError(
        error="device_not_found",
        message=f"Unknown device: {device}. Available: {available}"
    )

# ============================================================
# MESSAGE SANITIZATION
# ============================================================

def sanitize_message(message: str, max_words: int = 200) -> str:
    """Sanitize a message for TTS delivery."""
    import re

    # Remove code blocks
    message = re.sub(r'```[\s\S]*?```', '[code omitted]', message)
    message = re.sub(r'`[^`]+`', '', message)

    # Remove URLs
    message = re.sub(r'https?://\S+', '[link omitted]', message)

    # Remove special characters
    message = re.sub(r'[{}\[\]<>|\\^~]', '', message)

    # Normalize whitespace
    message = ' '.join(message.split())

    # Truncate
    words = message.split()
    if len(words) > max_words:
        message = ' '.join(words[:max_words]) + '...'

    return message.strip()

# ============================================================
# API CALLS
# ============================================================

def initiate_call(to: str, message: str, caller_id: str = DEFAULT_CALLER_ID,
                  mode: str = "announce", device: Optional[str] = None) -> Dict[str, Any]:
    """Initiate an outbound call via the Voice API."""
    url = f"{API_BASE_URL}/api/outbound-call"

    payload = {
        "to": to,
        "message": sanitize_message(message),
        "callerId": caller_id,
        "mode": mode,
        "device": resolve_device(device)
    }

    try:
        request_body = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=request_body,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            result = json.loads(response.read().decode('utf-8'))

            if result.get('success'):
                return {
                    "callId": result.get('callId'),
                    "to": to,
                    "device": payload['device'],
                    "mode": mode,
                    "status": result.get('status', 'initiated'),
                }
            else:
                raise CallFailedError(
                    error=result.get('error', 'call_failed'),
                    message=result.get('message', 'Call initiation failed')
                )

    except urllib.error.URLError as e:
        raise ServiceUnavailableError(
            error="service_unavailable",
            message=f"Voice server not reachable: {str(e.reason)}"
        )

def get_call_status(call_id: str) -> Dict[str, Any]:
    """Get the status of an existing call."""
    url = f"{API_BASE_URL}/api/call/{call_id}"

    req = urllib.request.Request(url, method='GET')
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode('utf-8'))

def list_calls() -> Dict[str, Any]:
    """List all active calls."""
    url = f"{API_BASE_URL}/api/calls"

    req = urllib.request.Request(url, method='GET')
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode('utf-8'))
```

---

## bin/call

```python
#!/usr/bin/env python3
"""Call Skill CLI - Initiate outbound voice calls"""

import sys
import os
import json
import argparse

# Add lib to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))

from api import (
    resolve_contact,
    initiate_call,
    get_call_status,
    list_calls,
    CONTACTS,
    DEVICES,
    VoiceAPIError,
    ContactNotFoundError,
    ServiceUnavailableError,
    CallFailedError,
    DeviceNotFoundError,
)


def output_success(data):
    print(json.dumps({"ok": True, "data": data}, indent=2))
    sys.exit(0)


def output_error(error: str, message: str, code: int = 1):
    print(json.dumps({"ok": False, "error": error, "message": message}, indent=2))
    sys.exit(code)


def cmd_outbound(args):
    try:
        phone_number = resolve_contact(args.target)
        message = args.message or "This is an automated call from your server."
        mode = args.mode or "announce"

        result = initiate_call(phone_number, message, mode=mode, device=args.device)
        output_success(result)

    except (ContactNotFoundError, ServiceUnavailableError,
            CallFailedError, DeviceNotFoundError) as e:
        output_error(e.error, e.message)
    except Exception as e:
        output_error("unexpected_error", str(e))


def cmd_status(args):
    try:
        result = get_call_status(args.call_id)
        output_success(result)
    except Exception as e:
        output_error("error", str(e))


def cmd_list(args):
    try:
        result = list_calls()
        output_success(result)
    except Exception as e:
        output_error("error", str(e))


def cmd_contacts(args):
    numbers = {}
    for alias, number in CONTACTS.items():
        if number not in numbers:
            numbers[number] = []
        numbers[number].append(alias)

    contacts = [{"number": n, "aliases": a} for n, a in numbers.items()]
    output_success({"contacts": contacts})


def cmd_devices(args):
    devices = [
        {"name": d["name"], "extension": d["extension"], "description": d["description"]}
        for d in DEVICES.values()
    ]
    output_success({"devices": devices})


def main():
    parser = argparse.ArgumentParser(description="Outbound voice calls via SIP")
    subparsers = parser.add_subparsers(dest='command')

    # outbound
    p = subparsers.add_parser('outbound')
    p.add_argument('target', help='Contact name or phone number')
    p.add_argument('--message', '-m', help='Message to speak')
    p.add_argument('--device', '-d', help='Device personality')
    p.add_argument('--mode', choices=['announce', 'conversation'], default='announce')
    p.set_defaults(func=cmd_outbound)

    # status
    p = subparsers.add_parser('status')
    p.add_argument('call_id')
    p.set_defaults(func=cmd_status)

    # list
    p = subparsers.add_parser('list')
    p.set_defaults(func=cmd_list)

    # contacts
    p = subparsers.add_parser('contacts')
    p.set_defaults(func=cmd_contacts)

    # devices
    p = subparsers.add_parser('devices')
    p.set_defaults(func=cmd_devices)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == '__main__':
    main()
```

---

## workflows/MakeCall.md

```markdown
# MakeCall Workflow

Step-by-step procedure for initiating an outbound call.

## Prerequisites

- Voice server running at configured URL
- Valid contact or phone number
- Message to deliver

## Steps

### Step 1: Parse Intent

Identify from user request:
1. **Who to call** - Contact name, alias, or phone number
2. **What to say** - Explicit message or generate from context
3. **Mode** - Announce (one-way) or conversation (two-way)
4. **Device** - Which AI personality (default: Morpheus)

### Step 2: Resolve Contact

Check contact directory, then validate as phone number:

```python
# Contact lookup
"me" → "YOUR_EXTENSION"

# Or direct number
"+15551234567" → "+15551234567"
```

### Step 3: Generate Message

If no explicit message:
- Summarize current task/conversation
- Keep under 50 words
- Format: "[Context]. [Result]. [Action if needed]."

### Step 4: Execute Call

```bash
call outbound <number> --message "<message>" [--mode conversation] [--device Cephanie]
```

### Step 5: Report Result

**Success:** "Calling [contact] now. Message: [summary]..."
**Failure:** "Failed to place call: [error]"

## Error Handling

| Error | Response |
|-------|----------|
| contact_not_found | "I don't have a number for [name]" |
| service_unavailable | "The voice server isn't responding" |
| call_failed | "The call couldn't be connected" |
```

---

## Usage Examples

Once installed, your AI can handle requests like:

```
You: Run the backup and call me when done
AI: [runs backup]
AI: Calling you now with the results.
[Your phone rings]
```

```
You: If disk usage goes over 90%, have Cephanie call me
AI: [monitors disk]
[When threshold hit]
AI: Cephanie is calling you about disk usage.
[Phone rings with Cephanie's voice]
```

```
You: Call me and let's discuss the deployment
AI: Calling you in conversation mode.
[Phone rings, you can have back-and-forth discussion]
```
