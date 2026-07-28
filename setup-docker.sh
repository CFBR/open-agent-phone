#!/bin/bash
# ============================================================================
# One-shot setup: deploy the full stack on any Linux Docker host
# ============================================================================
#
# Usage:
#   1. Copy to your Docker host
#   2. Edit .env with your settings
#   3. ./setup.sh
#
# This script:
#   - Checks prerequisites (Docker, git)
#   - Pulls all required Docker images
#   - Builds custom images (freeswitch, api-server, voice-app)
#   - Pulls the default Ollama model (llama3.2:3b)
#   - Starts all containers via docker-compose.full.yml
#   - Shows status and logs
#
# Zero-billing defaults:
#   AI_BACKEND=ollama  +  TTS_PROVIDER=kokoro  →  no API keys needed
#
# CPU compatibility:
#   ⚠  If your server runs under QEMU/KVM with an old virtual CPU,
#      FreeSWITCH will be built from source with AVX disabled.
#      This adds ~30min to setup time but ensures compatibility.
#
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Open Agent Phone — Full Docker Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ---- Prerequisites ----
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker not found. Install Docker first:${NC}"
    echo "  curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}Docker daemon not running. Start it:${NC}"
    echo "  sudo systemctl start docker"
    exit 1
fi

# Check compose plugin
COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif docker-compose --version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}Docker Compose not found. Install it:${NC}"
    echo "  sudo apt install docker-compose-plugin"
    exit 1
fi

echo -e "  Docker:        ${GREEN}$(docker --version)${NC}"
echo -e "  Compose:       ${GREEN}$($COMPOSE_CMD version)${NC}"
echo -e "  Architecture:  ${GREEN}$(uname -m)${NC}"
echo ""

# Check if AVX is available (affects freeswitch build)
if ! grep -q ' avx ' /proc/cpuinfo 2>/dev/null; then
    echo -e "  ${YELLOW}  ⚠  CPU lacks AVX — FreeSWITCH will be built from source${NC}"
    echo -e "  ${YELLOW}  This adds ~30min to the first setup.${NC}"
    echo ""
fi

# ---- .env ----
echo -e "${YELLOW}[2/6] Checking .env configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${YELLOW}  No .env found. Copying from .env.example...${NC}"
    cp .env.example .env
    echo -e "  ${RED}WARNING: Edit .env with your settings before continuing!${NC}"
    echo -e "  ${YELLOW}  At minimum, set:${NC}"
    echo -e "  ${YELLOW}    EXTERNAL_IP  → your server's LAN IP${NC}"
    echo -e "  ${YELLOW}    SIP_DOMAIN   → your 3CX FQDN (if using 3CX)${NC}"
    echo -e "  ${YELLOW}Then re-run this script.${NC}"
    exit 1
else
    echo -e "  .env ${GREEN}found${NC}"
fi
echo ""

# Source env vars (without exporting them all)
set -a; source .env; set +a

# ---- Pull images ----
echo -e "${YELLOW}[3/6] Pulling Docker images...${NC}"

$COMPOSE_CMD -f docker-compose.full.yml pull drachtio kokoro-tts ollama 2>&1 | while IFS= read -r line; do
    if [[ $line == *"Pulled"* ]] || [[ $line == *" pulling"* ]] || [[ $line == *" already"* ]]; then
        echo -e "  ${GREEN}$line${NC}"
    fi
done
echo -e "  ${GREEN}Images pulled${NC}"
echo ""

# ---- Build custom images ----
echo -e "${YELLOW}[4/6] Building custom Docker images...${NC}"

echo -e "  Building freeswitch (compatibility build)..."
$COMPOSE_CMD -f docker-compose.full.yml build freeswitch 2>&1 | tail -1

echo -e "  Building api-server..."
$COMPOSE_CMD -f docker-compose.full.yml build ai-backend 2>&1 | tail -1

echo -e "  Building voice-app..."
$COMPOSE_CMD -f docker-compose.full.yml build voice-app 2>&1 | tail -1

echo -e "  ${GREEN}Custom images built${NC}"
echo ""

# ---- Pull Ollama model ----
echo -e "${YELLOW}[5/6] Pulling default Ollama model...${NC}"
if [ "$AI_BACKEND" = "ollama" ]; then
    MODEL="${OLLAMA_MODEL:-llama3.2:3b}"
    echo -e "  Model: ${BLUE}$MODEL${NC} (this may take a few minutes)"

    # Start ollama briefly to pull the model
    docker run --rm -d --name ollama-pull \
        -v ollama-data:/root/.ollama \
        ollama/ollama:latest \
        sh -c "ollama serve & sleep 2 && ollama pull $MODEL && echo 'PULLED'" 2>&1 || true

    sleep 5
    if docker ps --filter name=ollama-pull --format '{{.Status}}' 2>/dev/null | grep -q "Up"; then
        echo -e "  ${YELLOW}Pull in progress (large model)... will continue in background${NC}"
        echo -e "  ${YELLOW}Containers will start once pull finishes${NC}"
    else
        echo -e "  ${GREEN}Model pulled${NC}"
    fi
else
    echo -e "  ${YELLOW}Skipping (AI_BACKEND is $AI_BACKEND, not ollama)${NC}"
fi
echo ""

# ---- Start services ----
echo -e "${YELLOW}[6/6] Starting services...${NC}"

$COMPOSE_CMD -f docker-compose.full.yml up -d --scale sbc=0 2>&1

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  ${BLUE}Status:${NC}"
$COMPOSE_CMD -f docker-compose.full.yml ps 2>&1
echo ""
echo -e "  ${BLUE}View logs:${NC}    $COMPOSE_CMD -f docker-compose.full.yml logs -f"
echo -e "  ${BLUE}Stop all:${NC}     $COMPOSE_CMD -f docker-compose.full.yml down"
echo -e "  ${BLUE}Voice API:${NC}    http://${EXTERNAL_IP:-127.0.0.1}:3000"
echo ""
echo -e "  ${YELLOW}First startup notes:${NC}"
echo -e "  - Ollama will auto-pull the model on first query (~2min)"
echo -e "  - Kokoro TTS loads models on first TTS request (~30s)"
echo -e "  - 3CX SBC must be installed NATIVELY (not in Docker)"
echo -e "    See docker/sbc/Dockerfile for details"
echo ""
echo -e "  ${YELLOW}Zero-billing?${NC}"
echo -e "  AI_BACKEND=${AI_BACKEND:-ollama} + TTS_PROVIDER=${TTS_PROVIDER:-kokoro}"
echo -e "  ${GREEN}✓ No API keys needed${NC}"
