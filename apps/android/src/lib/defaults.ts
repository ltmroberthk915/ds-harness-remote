/**
 * Build-time defaults for the standby (self-hosted) Remote server.
 *
 * The Host keeps this origin as its fallback when the official server stays
 * unreachable, and this phone only needs to be authorized there once. Override
 * per build with `EXPO_PUBLIC_DSH_REMOTE_FALLBACK_SERVER`; clearing the field in
 * Settings disables the failover for that installation.
 */
export const DEFAULT_FALLBACK_SERVER_URL = process.env.EXPO_PUBLIC_DSH_REMOTE_FALLBACK_SERVER?.trim() || 'https://jtxz.top'
