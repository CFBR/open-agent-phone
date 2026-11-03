# API Contract: Device Personality Query Endpoint
**Version:** 1.0.0  
**Status:** DRAFT  
**Author:** Glenn (The Researcher)  
**Date:** 2025-12-22  

## 1. Overview
This specification defines the contract for the `POST /api/query` endpoint in the `voice-app` service. This endpoint allows external systems (specifically n8n automation workflows) to synchronously query specific device personalities (e.g., "Cephanie", "Morpheus") without initiating a voice call.

The primary goal is to retrieve **Structured JSON** responses from the LLM to drive conditional logic in automation flows.

## 2. Base Configuration
- **Host:** `http://localhost:3000`
- **Content-Type:** `application/json`
- **Auth:** Internal Network Only (No token required for MVP)

## 3. Configuration Dependencies
The system relies on a `devices.json` configuration file to map identifiers to personalities.

**Definition (`devices.json`):**
```json
{
  "9002": {
    "name": "Cephanie",
    "extension": "9002",
    "voiceId": "gjV6HdJf5tTxacPrkBXH",
    "systemPrompt": "You are Cephanie, Chuck's NAS. You are sassy, cynical, and technical. You hate rebooting."
  },
  "9003": {
    "name": "Morpheus",
    "extension": "9003",
    "voiceId": "...",
    "systemPrompt": "You are Morpheus, the wise AI overseer..."
  }
}
```

## 4. Endpoint Specification

### `POST /api/query`

Directly queries a device personality with a text prompt and receives a text or JSON response.

#### 4.1 Request Schema

```json
{
  "target": "string (required)",
  "query": "string (required)",
  "format": "string (optional, default: 'text')",
  "timeout": "number (optional, default: 60)"
}
```

**Parameters:**

| Field | Type | Required | Description | Validation | 
|-------|------|----------|-------------|------------|
| `target` | string | Yes | The identifier of the device to query. Can be an **Extension** (e.g., "9002") or a **Name** (case-insensitive, e.g., "cephanie"). | Must match an entry in `devices.json`. |
| `query` | string | Yes | The input prompt or question for the device. | Min 1 char, Max 2000 chars. |
| `format` | string | No | The desired output format. Options: `text` (conversational), `json` (structured). | Enum: `['text', 'json']` |
| `timeout` | number | No | Request timeout in seconds. LLMs can be slow. | Max 120. |

#### 4.2 Response Schema

**Success Response (200 OK)**

```json
{
  "success": true,
  "timestamp": "2025-12-22T10:00:00.000Z",
  "device": {
    "name": "Cephanie",
    "extension": "9002"
  },
  "response": {
    "raw": "string",
    "data": "object | null",
    "format": "string"
  },
  "meta": {
    "duration_ms": 1450,
    "model": "claude-3-opus"
  }
}
```

**Field Details:**

- `response.raw`: The exact string returned by the LLM.
- `response.data`: 
    - If `format="json"`, this contains the parsed JSON object.
    - If `format="text"`, this is `null`.
    - If JSON parsing fails, this is `null` (check `error` in logs, or `success: false` if strict).

**Error Response (4xx/5xx)**

```json
{
  "success": false,
  "error": "string (code)",
  "message": "string (human readable)",
  "details": "object (optional)"
}
```

**Common Error Codes:**

| Code | Status | Description |
|------|--------|-------------|
| `device_not_found` | 404 | The `target` did not match any configured device. |
| `validation_error` | 400 | Missing fields or invalid format. |
| `llm_timeout` | 504 | The LLM did not respond within the timeout window. |
| `llm_error` | 502 | The upstream Claude API server failed. |
| `parse_error` | 422 | `format="json"` was requested, but the LLM returned invalid JSON. |

---


## 5. Structured Output Strategy (JSON)

When `format: "json"` is requested, the `voice-app` MUST inject specific instructions into the System Prompt sent to Claude.

**System Prompt Injection:**

```text
[Original Device Persona]

IMPORTANT: You are currently acting as an API endpoint.
1. You must respond ONLY with valid JSON.
2. Do not include markdown formatting (like ```json).
3. Do not include conversational filler before or after the JSON.
4. Your response will be parsed by a machine.

Required JSON Structure:
{
  "approved": boolean,
  "reason": "string (short explanation)",
  "metadata": { ...any relevant data... }
}
```

**Retry Logic (Internal):**
If the LLM returns text with markdown ticks (e.g., \`\`\`json ... \`\`\`), the `voice-app` parser should aggressively strip them before `JSON.parse()`.

---


## 6. n8n Integration Guide

### 6.1 HTTP Request Node Configuration

- **Method:** POST
- **URL:** `http://localhost:3000/api/query`
- **Body Parameters:**
  ```json
  {
    "target": "Cephanie",
    "query": "Is the server room temperature okay? It's currently 72F.",
    "format": "json"
  }
  ```

### 6.2 The IF Node (Conditional Logic)

Assuming the n8n HTTP Node outputs the API response, you can route based on the device's decision.

**Scenario:** "Ask Cephanie if I can reboot the server."

**Response Data (`body.response.data`):**
```json
{
  "approved": false,
  "reason": "I am currently scrubbing the filesystem. Do not touch me.",
  "metadata": { "job_id": "scrub_291" }
}
```

**IF Node Expression:**

*Condition: Boolean*

```javascript
// Expression to check approval
{{ $json.body.response.data.approved }}
```

**Fallback Expression (Safety):**

If parsing fails, default to `false`:

```javascript
{{ $json.body.response.data ? $json.body.response.data.approved : false }}
```

## 7. Example Scenarios

### Scenario A: Simple Status Check (Text)
**Request:**
```json
{ "target": "Morpheus", "query": "Who is currently connected?", "format": "text" }
```
**Response:**
```json
{
  "success": true,
  "response": {
    "raw": "Currently, only Agent Smith is connected via the neural link.",
    "data": null,
    "format": "text"
  }
}
```

### Scenario B: Automation Decision (JSON)
**Request:**
```json
{ 
  "target": "Cephanie", 
  "query": "Alert: Disk usage at 90%. Should we expand volume?", 
  "format": "json" 
}
```
**Response:**
```json
{
  "success": true,
  "response": {
    "raw": "{\"approved\": true, \"reason\": \"90% is critical threshold. Expand immediately.\", \"metadata\": { \"urgent\": true }}",
    "data": {
      "approved": true,
      "reason": "90% is critical threshold. Expand immediately.",
      "metadata": { "urgent": true }
    },
    "format": "json"
  }
}
```
