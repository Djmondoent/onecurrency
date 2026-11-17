import React from 'react'

export default function SatsInfo() {
  const rows = [
    ['1 satoshi', '0.00000001 bitcoin'],
    ['10 satoshi', '0.0000001 bitcoin'],
    ['100 satoshi', '0.000001 bitcoin'],
    ['1,000 satoshi', '0.00001 bitcoin'],
    ['10,000 satoshi', '0.0001 bitcoin'],
    ['100,000 satoshi', '0.001 bitcoin'],
    ['1,000,000 satoshi', '0.01 bitcoin'],
    ['10,000,000 satoshi', '0.1 bitcoin'],
    ['100,000,000 satoshi', '1 bitcoin'],
  ]

  return (
    <section style={{ lineHeight: 1.6 }}>
      <div className="heading" style={{ fontSize: 18, marginBottom: 4 }}>Satoshi 101</div>
      <p className="subtle" style={{ marginTop: 4 }}>
        One bitcoin equals 100,000,000 satoshis. Sats make small payments easy to read and share.
      </p>
      <div className="scroll" style={{ marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Satoshi</th>
              <th style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Bitcoin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([sats, btc]) => (
              <tr key={sats}>
                <td style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>{sats}</td>
                <td style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>{btc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
