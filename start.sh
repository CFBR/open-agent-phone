#!/bin/bash
# ============================================================================
# Claude Phone Startup Script
# ============================================================================
# Automatically detects your LAN IP and starts the voice services.
# Works on both Mac and Linux.
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "  Claude Phone Startup"
echo "======================================"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
    # Get Mac's primary LAN IP (usually en0 for Wi-Fi or en1 for Ethernet)
    DETECTED_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
else
    OS="linux"
    # Get Linux's primary LAN IP
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 | awk '{print $7;exit}' 2>/dev/null || echo "")
fi

echo -e "Detected OS: ${GREEN}$OS${NC}"

# Check if EXTERNAL_IP is already set in .env
if [ -f .env ]; then
    EXISTING_IP=$(grep "^EXTERNAL_IP=" .env | cut -d'=' -f2)
fi

# Determine which IP to use
if [ -n "$EXTERNAL_IP" ]; then
    # Environment variable takes precedence
    IP_TO_USE="$EXTERNAL_IP"
    echo -e "Using EXTERNAL_IP from environment: ${GREEN}$IP_TO_USE${NC}"
elif [ -n "$EXISTING_IP" ] && [ "$EXISTING_IP" != "10.0.0.100" ]; then
    # Use existing .env value if it's been customized
    IP_TO_USE="$EXISTING_IP"
    echo -e "Using EXTERNAL_IP from .env: ${GREEN}$IP_TO_USE${NC}"
elif [ -n "$DETECTED_IP" ]; then
    # Auto-detect
    IP_TO_USE="$DETECTED_IP"
    echo -e "Auto-detected LAN IP: ${GREEN}$IP_TO_USE${NC}"
else
    echo -e "${RED}ERROR: Could not detect LAN IP${NC}"
    echo "Please set EXTERNAL_IP manually:"
    echo "  export EXTERNAL_IP=your.lan.ip.here"
    echo "  ./start.sh"
    exit 1
fi

# Export for docker compose
export EXTERNAL_IP="$IP_TO_USE"

# Check for required .env file
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    echo "Please run 'claude-phone setup' first or copy .env.example to .env"
    exit 1
fi

# Determine compose command
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo -e "${RED}ERROR: Docker Compose not found${NC}"
    exit 1
fi

# On Mac, suggest bridge mode if having issues
if [ "$OS" == "mac" ]; then
    echo ""
    echo -e "${YELLOW}Note: On Mac, if you experience SIP registration issues,${NC}"
    echo -e "${YELLOW}try bridge mode:${NC}"
    echo "  $COMPOSE_CMD -f docker-compose.yml -f docker-compose.bridge.yml up -d"
    echo ""
fi

# Start the containers
echo "Starting Claude Phone services..."
echo "EXTERNAL_IP=$EXTERNAL_IP"
echo ""

$COMPOSE_CMD up -d

echo ""
echo -e "${GREEN}Services started!${NC}"
echo ""
echo "View logs:     $COMPOSE_CMD logs -f"
echo "Stop:          $COMPOSE_CMD down"
echo "Voice API:     http://$IP_TO_USE:3000"
echo ""
