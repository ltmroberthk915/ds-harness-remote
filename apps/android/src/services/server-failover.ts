import { DEFAULT_FALLBACK_SERVER_URL } from '../lib/defaults'
import { normalizeServerUrl } from '../lib/server-url'

/** How often a failed-over app checks whether its primary server is reachable again. */
export const PRIMARY_RECOVERY_PROBE_MS = 60_000
/** Consecutive healthy probes required before the app returns to its primary server. */
export const PRIMARY_RECOVERY_CONFIRMATIONS = 2

export interface ServerTargetsInput {
  baseUrl: string
  fallbackBaseUrl?: string
}

/**
 * Effective standby origin.
 *
 * An unset field means "use the build default"; an explicitly empty string means
 * the user disabled the failover in Settings, so a cleared field must never be
 * silently replaced by the default again.
 */
export function standbyServerUrl(config: ServerTargetsInput): string | undefined {
  if (config.fallbackBaseUrl === undefined) return DEFAULT_FALLBACK_SERVER_URL
  const trimmed = config.fallbackBaseUrl.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Origins a connect attempt may use, primary first.
 *
 * The Host keeps a standby origin for the case where the official server is
 * unreachable, and device credentials are stored per origin, so both attempts
 * can be silent. Blank, malformed and duplicate entries are dropped: a broken
 * fallback must never delay or replace the primary attempt.
 */
export function resolveServerTargets(input: ServerTargetsInput): string[] {
  const targets: string[] = []
  for (const value of [input.baseUrl, standbyServerUrl(input)]) {
    const trimmed = value?.trim() ?? ''
    if (trimmed === '') continue
    let normalized: string
    try {
      normalized = normalizeServerUrl(trimmed)
    } catch {
      continue
    }
    if (!targets.includes(normalized)) targets.push(normalized)
  }
  return targets
}

/**
 * Counts consecutive healthy probes of the primary server.
 *
 * A single stray 200 must not move the app back, and a failed probe resets the
 * streak, so a flapping server keeps the working standby connection.
 */
export class PrimaryRecoveryProbe {
  private hits = 0

  observe(healthy: boolean): boolean {
    this.hits = healthy ? this.hits + 1 : 0
    if (this.hits < PRIMARY_RECOVERY_CONFIRMATIONS) return false
    this.hits = 0
    return true
  }

  reset(): void {
    this.hits = 0
  }
}
