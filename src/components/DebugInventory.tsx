import { useReportStore } from '../store/reportStore'

export function DebugInventory() {
  const workbook = useReportStore((s) => s.workbook)
  if (!workbook) return null

  const { meta, sheets, inUse, idleAgents, warnings } = workbook
  return (
    <section style={{ fontFamily: 'Arial, Helvetica, sans-serif', marginTop: 24 }}>
      <h2>
        {meta.customer || '(unknown customer)'} — collector {meta.collectorBuild || 'n/a'}
      </h2>
      <p>
        Agents in use: <strong>{inUse.length}</strong> · idle (present, not in use):{' '}
        <strong>{idleAgents.length}</strong>
        {meta.capturedAt && <> · captured {meta.capturedAt.slice(0, 10)}</>}
      </p>
      {warnings.length > 0 && (
        <ul style={{ color: '#b45309' }}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 12px' }}>Sheet</th>
            <th style={{ textAlign: 'right', padding: '4px 12px' }}>Rows</th>
            <th style={{ textAlign: 'left', padding: '4px 12px' }}>Capped</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(sheets).map((s) => (
            <tr key={s.name}>
              <td style={{ padding: '4px 12px' }}>
                {s.name} {inUse.includes(s.name) ? '✅' : idleAgents.includes(s.name) ? '💤' : ''}
              </td>
              <td style={{ textAlign: 'right', padding: '4px 12px' }}>{s.rows.length}</td>
              <td style={{ padding: '4px 12px' }}>{s.capped ? '⚠️ yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
