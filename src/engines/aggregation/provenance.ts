import type { MetricKey, MetricProvenance } from '../../types/reportView'

/** Provenance for a single detail-format server: every metric available. */
export function allAvailable(assetsTotal: number): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: true, serversCovered: 1, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: {
      available: true,
      serversCovered: 1,
      serversTotal: 1,
      assetsCovered: assetsTotal,
      assetsTotal,
    },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}

/** Provenance for a single summary-format server: every detail-only metric unavailable. */
export function allUnavailable(assetsTotal: number): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: false, serversCovered: 0, serversTotal: 1 },
    compliance: {
      available: false,
      serversCovered: 0,
      serversTotal: 1,
      assetsCovered: 0,
      assetsTotal,
    },
    storageTargets: { available: false, serversCovered: 0, serversTotal: 1 },
  }
}

/** Provenance for a single Avamar server: count-based coverage + node capacity available;
 *  per-type coverage and copy compliance are not in Avamar exports. */
export function avamarProvenance(): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: {
      available: false,
      serversCovered: 0,
      serversTotal: 1,
      assetsCovered: 0,
      assetsTotal: 0,
    },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}

/** Provenance for a single NetWorker server: count-based coverage (no per-type),
 *  but gaps, compliance (immutable/replication computed), and DD capacity are available. */
export function networkerProvenance(assetsTotal: number): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: {
      available: true,
      serversCovered: 1,
      serversTotal: 1,
      assetsCovered: assetsTotal,
      assetsTotal,
    },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}
