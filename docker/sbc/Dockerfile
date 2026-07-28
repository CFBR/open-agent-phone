# ============================================================================
# NOTE: 3CX SBC in Docker — Limited Availability
# ============================================================================
#
# As of 2026, 3CX has deprecated the standalone x86 Debian package.
# The SBC is now distributed only as:
#   1. A full Debian ISO (includes SBC pre-installed)
#      https://www.3cx.com/docs/3cx-tunnel-session-border-controller/
#   2. Windows MSI installer
#   3. Raspberry Pi OS package: apt install raspberrypi-3cx-sbc
#
# If your host runs a matching distribution, you can install 3cxsbc natively:
#   - x86 Debian/Ubuntu: Use the 3CX Debian ISO VM
#   - Raspberry Pi:      apt install raspberrypi-3cx-sbc
#   - Windows:           Download the MSI from 3CX management console
#
# For Docker deployments WITHOUT an SBC, configure port forwarding on your
# firewall to route SIP (5060) and RTP to the drachtio server, or use a
# lightweight SIP proxy like Kamailio.
#
# ============================================================================
# Placeholder — builds only as a documentation base. To run the real SBC:
#   1. Create an SBC in your 3CX Management Console
#   2. Download the provisioning .prov file
#   3. Install natively on the host (VM or bare metal)
#   4. Point SBC_AUTH_ID / SBC_PASSWORD to your host's installed SBC
# ============================================================================

FROM scratch
LABEL description="3CX SBC — install natively on host, not in Docker"
LABEL doc-url="https://www.3cx.com/docs/3cx-tunnel-session-border-controller/"
