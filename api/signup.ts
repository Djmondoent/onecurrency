import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, ref } = req.body || {}
  if (!email || !/.+@.+/.test(email)) return res.status(400).json({ error: 'email required' })

  let refCode: string | null = null
  if (ref) {
    const { data } = await supabase.from('referrers').select('code').eq('code', ref).limit(1).single()
    if (data?.code) refCode = data.code
  }

  const { error } = await supabase.from('signups').insert({ email, ref_code: refCode })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
}
