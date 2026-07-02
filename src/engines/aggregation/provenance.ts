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
    frontEnd: { available: true, serversCovered: 1, serversTotal: 1 },
    // PPDM reliability wiring is a follow-up — unavailable for now.
    reliability: { available: false, serversCovered: 0, serversTotal: 1 },
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
    frontEnd: { available: false, serversCovered: 0, serversTotal: 1 },
    reliability: { available: false, serversCovered: 0, serversTotal: 1 },
  }
}

/** Provenance for a single Avamar server: count-based coverage + node capacity available;
 *  per-type coverage unavailable; replication resilience + front-end volumetry available
 *  via detail sheets. `reliabilityAvailable` reflects whether any of the reliability
 *  source sheets (Avamar DPN Summary / Job List Detailed / Backup Runtime Summary) had rows. */
export function avamarProvenance(
  reliabilityAvailable: boolean,
): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: {
      available: true,
      serversCovered: 1,
      serversTotal: 1,
      assetsCovered: 1,
      assetsTotal: 1,
    },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
    frontEnd: { available: true, serversCovered: 1, serversTotal: 1 },
    reliability: {
      available: reliabilityAvailable,
      serversCovered: reliabilityAvailable ? 1 : 0,
      serversTotal: 1,
    },
  }
}

/** Provenance for a single NetWorker server: count-based coverage (no per-type),
 *  but gaps, compliance (immutable/replication computed), and DD capacity are available.
 *  `reliabilityAvailable` reflects whether the Jobs sheet had rows. */
export function networkerProvenance(
  assetsTotal: number,
  reliabilityAvailable: boolean,
): Record<MetricKey, MetricProvenance> {
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
    frontEnd: { available: true, serversCovered: 1, serversTotal: 1 },
    reliability: {
      available: reliabilityAvailable,
      serversCovered: reliabilityAvailable ? 1 : 0,
      serversTotal: 1,
    },
  }
}
