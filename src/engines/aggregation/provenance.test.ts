import { describe, expect, it } from 'vitest'
import { allAvailable, allUnavailable } from './provenance'

describe('provenance builders', () => {
  it('allAvailable marks every detail metric available for one server', () => {
    const p = allAvailable(3886)
    expect(p.compliance).toEqual({
      available: true,
      serversCovered: 1,
      serversTotal: 1,
      assetsCovered: 3886,
      assetsTotal: 3886,
    })
    expect(p.gapsList.available).toBe(true)
  })

  it('allUnavailable marks every detail metric unavailable but records asset total', () => {
    const p = allUnavailable(1855)
    expect(p.compliance).toEqual({
      available: false,
      serversCovered: 0,
      serversTotal: 1,
      assetsCovered: 0,
      assetsTotal: 1855,
    })
    expect(p.storageTargets.available).toBe(false)
  })
})
