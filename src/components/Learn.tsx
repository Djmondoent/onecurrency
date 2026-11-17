import React, { useState } from 'react'
import WindowShell from './WindowShell'
import SatsInfo from './SatsInfo'

type Topic = { id: string; title: string; points: string[]; cta?: { label: string; href: string } }

const topics: Topic[] = [
  { id: 'sats', title: 'Satoshi 101', points: ['1 BTC = 100,000,000 sats', 'Sats make small payments easy to read', 'Use the converter to check value quickly'] },
  { id: 'faucet', title: 'What is a Bitcoin Faucet?', points: ['A faucet gives small amounts of BTC so you can test sending and receiving', 'Use faucets for learning only; they are not for earning real income', 'Claim, send to your wallet, and practice backing up your keys'], cta: { label: 'Open OneCurrency Faucet', href: 'https://onecurrency.net/onefaucet' } },
  { id: 'what-bitcoin', title: 'What is Bitcoin?', points: ['Digital cash with no company or bank in charge', 'Runs on a public network secured by miners', 'You hold value with a wallet and a recovery phrase'] },
  { id: 'what-money', title: 'What is Money?', points: ['A shared way to store and trade value', 'Good money is scarce, portable, and hard to fake', 'Bitcoin is digital, scarce, and moves globally in minutes'] },
  { id: 'mining', title: 'Bitcoin Mining', points: ['Miners bundle transactions into blocks', 'They compete with energy + hardware to add blocks', 'Honest work secures the network and earns new BTC + fees'] },
  { id: 'non-custodial', title: 'Why Non-Custodial?', points: ['Only you hold the keys; no one can freeze your funds', 'No ID or personal data required to self-custody', 'Take back your privacy by keeping control of your wallet'] },
  { id: 'kyc', title: 'KYC and Privacy', points: ['KYC collects IDs and links your transactions to you', 'No-KYC wallets avoid sharing personal info', 'Protect your identity by staying in control of your keys'] },
  { id: 'keys', title: 'Keep Your Keys Safe', points: ['Your 12, 20, or 24 words = your money; lose them and funds are gone', 'Store offline on paper/metal; never share or screenshot', 'Back up once, verify twice, and keep spares in safe places'] },
]

export default function Learn() {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <WindowShell id="learn" title="Learn" className="mt-20">
      <div className="kv" style={{ color: '#cbd5e1', marginTop: -6 }}>New to Bitcoin or wallets? Start here before unlocking.</div>
      <p className="subtle" style={{ marginTop: 4 }}>Quick primers for new users. Open a topic to read the essentials.</p>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        <a className="btn" href="/tutorial.html">Quick Start Tutorial</a>
        <a className="btn" href="/faq.html">FAQ</a>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {topics.map((topic) => (
          <button
            key={topic.id}
            className={`btn ${openId === topic.id ? 'btn-primary' : ''}`}
            onClick={() => setOpenId(openId === topic.id ? null : topic.id)}
          >
            {topic.title}
          </button>
        ))}
      </div>

      {openId === 'sats' && (
        <div style={{ marginTop: 12 }}>
          <SatsInfo />
        </div>
      )}

      {openId && openId !== 'sats' && (() => {
        const topic = topics.find(t => t.id === openId)
        if (!topic) return null
        return (
          <WindowShell id={`learnTopic-${topic.id}`} title={topic.title} className="mt-12">
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {topic.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
            {topic.cta && (
              <div className="row" style={{ marginTop: 10 }}>
                <a className="btn btn-primary" href={topic.cta.href} target="_blank" rel="noreferrer">{topic.cta.label}</a>
              </div>
            )}
          </WindowShell>
        )
      })()}
    </WindowShell>
  )
}
