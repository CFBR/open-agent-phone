# ============================================================================
# AI Backend Server Docker Image
# ============================================================================
#
# Pluggable AI backend for the voice system. Supports:
#   - Ollama (local, free, default)
#   - Claude Code CLI (requires subscription + mounted auth)
#   - OpenAI / OpenRouter / any OpenAI-compatible API
#
# Set AI_BACKEND env var to select the provider (see server.js for details).
#
# # For Ollama (default, free):
#   docker compose up -d ollama ai-backend
#   (Ollama will pull the model on first request)
#
# # For Claude CLI:
#   mount ~/.claude:/root/.claude:ro
#   set AI_BACKEND=claude
#
# # For OpenAI, OpenRouter, or Nano-GPT:
#   set AI_BACKEND=openai    and OPENAI_API_KEY
#   set AI_BACKEND=openrouter and OPENROUTER_API_KEY
#
# # For OpenCode:
#   build with --build-arg INSTALL_OPENCODE=true
#   mount ~/.local/share/opencode:/root/.local/share/opencode:ro
#   mount ~/.config/opencode:/root/.config/opencode:ro
#   set AI_BACKEND=opencode and OPENCODE_MODEL=provider/model
#
# ============================================================================

FROM node:20-bookworm-slim

ARG INSTALL_OPENCODE=false

ENV NODE_ENV=production \
    PORT=3333 \
    AI_BACKEND=ollama \
    OLLAMA_URL=http://ollama:11434 \
    OLLAMA_MODEL=llama3.2:3b \
    OPENCODE_AUTO_APPROVE=0 \
    CLAUDE_MODEL=claude-sonnet-4-20250514

WORKDIR /app

# Copy package files and install
COPY claude-api-server/package.json ./
RUN npm install --omit=dev

# Copy source
COPY claude-api-server/ ./ 

# Optional: install the OpenCode CLI for AI_BACKEND=opencode.
RUN if [ "$INSTALL_OPENCODE" = "true" ]; then npm install -g @opencode/cli; fi

# Optional: Install Claude CLI binary for claude backend mode
# This is a multi-GB install, so we keep it separate.
# RUN npm install -g @anthropic-ai/claude-code \
#     && claude --version

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3333) + '/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

EXPOSE 3333

CMD ["node", "server.js"]
