import { describe, expect, it } from 'vitest'
import { DEFAULT_FALLBACK_SERVER_URL } from '../src/lib/defaults'
import { PRIMARY_RECOVERY_CONFIRMATIONS, PrimaryRecoveryProbe, resolveServerTargets, standbyServerUrl } from '../src/services/server-failover'

describe('standby server configuration', () => {
  it('falls back to the build default only while the field was never edited', () => {
    expect(standbyServerUrl({ baseUrl: 'https://official.example' })).toBe(DEFAULT_FALLBACK_SERVER_URL)
    expect(standbyServerUrl({ baseUrl: 'https://official.example', fallbackBaseUrl: ' https://standby.example ' })).toBe('https://standby.example')
    // An explicitly cleared field disables the failover; the build default must not win.
    expect(standbyServerUrl({ baseUrl: 'https://official.example', fallbackBaseUrl: '   ' })).toBeUndefined()
  })

  it('orders the primary before the standby and drops blanks, duplicates and malformed entries', () => {
    expect(resolveServerTargets({ baseUrl: 'https://official.example' })).toEqual(['https://official.example', DEFAULT_FALLBACK_SERVER_URL])
    expect(resolveServerTargets({ baseUrl: 'https://official.example/', fallbackBaseUrl: 'https://official.example' }))
      .toEqual(['https://official.example'])
    expect(resolveServerTargets({ baseUrl: 'https://official.example', fallbackBaseUrl: '' })).toEqual(['https://official.example'])
    expect(resolveServerTargets({ baseUrl: 'https://official.example', fallbackBaseUrl: 'not a url' })).toEqual(['https://official.example'])
    expect(resolveServerTargets({ baseUrl: 'https://official.example', fallbackBaseUrl: 'http://plain.example' }))
      .toEqual(['https://official.example'])
  })
})

describe('primary recovery probe', () => {
  it('needs consecutive healthy probes and resets on a failure', () => {
    const probe = new PrimaryRecoveryProbe()
    for (let hit = 1; hit < PRIMARY_RECOVERY_CONFIRMATIONS; hit += 1) {
      expect(probe.observe(true)).toBe(false)
    }
    expect(probe.observe(false)).toBe(false)
    expect(probe.observe(true)).toBe(false)
    expect(probe.observe(true)).toBe(true)
    // The streak restarts after a switch so a later flap needs two fresh probes.
    expect(probe.observe(true)).toBe(false)
    probe.reset()
    expect(probe.observe(true)).toBe(false)
  })
})
