import { DebugInventory } from './components/DebugInventory'
import { UploadZone } from './components/UploadZone'

export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <h1>PPDM Report</h1>
      <UploadZone />
      <DebugInventory />
    </main>
  )
}
