# ============================================================================
# FreeSWITCH media server for docker-compose.full.yml
# ============================================================================
# The upstream drachtio MRF image is multi-arch and already ships the
# FreeSWITCH build used by voice-app. Compose overrides the command with the
# port and RTP range, so this image only needs to exist and be pinnable.
#
# If you need a compatibility build (for example a QEMU CPU without AVX), add
# the build steps here. Do not point compose at a Dockerfile that is missing.
# ============================================================================

FROM drachtio/drachtio-freeswitch-mrf:0.9.4
