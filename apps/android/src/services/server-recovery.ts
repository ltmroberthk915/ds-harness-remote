import { RemoteServerApi } from './api'
import { PRIMARY_RECOVERY_PROBE_MS, PrimaryRecoveryProbe } from './server-failover'

export interface PrimaryRecoveryOptions {
  /** Origin the app should return to once it answers again. */
  primaryUrl: string
  /** Called once the primary server stayed healthy long enough to switch back. */
  onRecovered: () => void
  /** Health probe override for tests. */
  probe?: (baseUrl: string, signal: AbortSignal) => Promise<boolean>
}

let timer: ReturnType<typeof setInterval> | undefined
let inflight: AbortController | undefined
const probe = new PrimaryRecoveryProbe()

async function defaultProbe(baseUrl: string, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false
  try {
    await new RemoteServerApi(baseUrl).health()
    return !signal.aborted
  } catch {
    return false
  }
}

/**
 * While the app runs on its standby origin, poll the primary server in the
 * background and switch back automatically after it recovers. Stops itself on
 * the first switch, on failure of the caller to stop it, or on sign-out.
 */
export function startPrimaryRecovery(options: PrimaryRecoveryOptions): void {
  stopPrimaryRecovery()
  const run = options.probe ?? defaultProbe
  timer = setInterval(() => {
    if (inflight !== undefined) return
    const controller = new AbortController()
    inflight = controller
    void run(options.primaryUrl, controller.signal)
      .then(healthy => {
        if (timer === undefined) return
        if (!probe.observe(healthy)) return
        stopPrimaryRecovery()
        options.onRecovered()
      })
      .catch(() => undefined)
      .finally(() => {
        if (inflight === controller) inflight = undefined
      })
  }, PRIMARY_RECOVERY_PROBE_MS)
  // The probe must never be the reason the app keeps a timer alive.
  timer.unref?.()
}

export function stopPrimaryRecovery(): void {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
  inflight?.abort()
  inflight = undefined
  probe.reset()
}

export function primaryRecoveryActive(): boolean {
  return timer !== undefined
}
