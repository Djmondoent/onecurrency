import React, { useMemo, useState } from 'react'
import WindowShell from './WindowShell'

export default function SatsReminder() {
  const [satsInput, setSatsInput] = useState('1000')
  const sats = useMemo(() => {
    const n = parseFloat(satsInput || '0')
    if (Number.isFinite(n) && n >= 0) return n
    return 0
  }, [satsInput])
  const btc = sats / 1e8

  return (
    <WindowShell id="satsConverter" title="Sats" className="mt-12">
      <div className="kv" style={{ fontWeight: 600 }}>1 BTC = 100,000,000 sats.</div>
      <div className="subtle" style={{ marginTop: 4 }}>Use the converter below to check value.</div>
      <label style={{ display: 'block', marginTop: 10 }}>
        Sats
        <input
          className="input"
          type="number"
          min={0}
          step="1"
          value={satsInput}
          onChange={(e) => setSatsInput(e.target.value)}
          placeholder="e.g. 5000"
        />
      </label>
      <div className="kv" style={{ marginTop: 8 }}>
        ≈ {btc.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} BTC
      </div>
    </WindowShell>
  )
}
