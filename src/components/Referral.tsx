import React, { useEffect, useState } from 'react'
import WindowShell from './WindowShell'

const API_BASE = 'https://wgvptzxjdpeycfdietyd.functions.supabase.co'

const postJson = async (path: string, body: any) => {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

export default function Referral() {
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [refCode, setRefCode] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const r = params.get('ref')
    if (r) setRefCode(r)
  }, [])

  const enroll = async () => {
    setErr('')
    setMsg('')
    try {
      const data = await postJson('/referrers', { email })
      setLink(data.referral_link || '')
      setMsg('Referral link generated.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to create referral link')
    }
  }

  const signup = async () => {
    setErr('')
    setMsg('')
    try {
      await postJson('/signup', { email: signupEmail, ref: refCode || undefined })
      setMsg('Signed up! If a referrer code was present, it was recorded.')
    } catch (e: any) {
      setErr(e?.message || 'Failed to sign up')
    }
  }

  return (
    <div className="grid" style={{ gap: 12 }}>
      <WindowShell id="referLink" title="Get my referral link">
        <p className="subtle">Enter your email to join the referral program.</p>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={enroll}>Generate link</button>
        {link && <div className="surface" style={{ marginTop: 10, wordBreak: 'break-all' }}>{link}</div>}
      </WindowShell>
      <WindowShell id="referJoin" title="Join with a referral">
        {refCode && <div className="badge">Referred code: {refCode}</div>}
        <input className="input" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="your email" />
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={signup}>Join</button>
      </WindowShell>
      {msg && <div className="alert success">{msg}</div>}
      {err && <div className="alert">{err}</div>}
    </div>
  )
}
