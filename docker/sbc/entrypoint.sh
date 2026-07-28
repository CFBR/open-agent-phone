#!/bin/bash
# ============================================================================
# 3CX SBC Entrypoint — Placeholder
# ============================================================================
# The 3CX SBC package is no longer distributed for x86 Debian.
# Install the SBC natively on your host:
#   - Download the 3CX Debian ISO from your management console
#   - Or use a Raspberry Pi with: apt install raspberrypi-3cx-sbc
#   - Or install on Windows
#
# For the Docker stack, skip this service and configure:
#   - Port forwarding on your router (5060 UDP/TCP → drachtio)
#   - Or a lightweight SIP proxy (Kamailio, OpenSIPS)
# ============================================================================

echo "================================================================"
echo "  3CX SBC Docker Container"
echo "================================================================"
echo ""
echo "  NOTE: The 3CX SBC Debian package is no longer distributed"
echo "  for x86_64. Please install the SBC natively on your host"
echo "  or use a lightweight SIP proxy."
echo ""
echo "  Docs: https://www.3cx.com/docs/3cx-tunnel-session-border-controller/"
echo ""
echo "  To skip this service, remove 'sbc' from docker-compose.full.yml"
echo "  or use: docker compose up -d --scale sbc=0"
echo "================================================================"
echo ""

# Sleep indefinitely so the container stays up for inspection
sleep infinity
