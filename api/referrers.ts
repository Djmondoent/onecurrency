import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

const genCode = () => Math.random().toString(36).slice(2, 10)

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email } = req.body || {}
  if (!email || !/.+@.+/.test(email)) return res.status(400).json({ error: 'email required' })

  const { data: existing } = await supabase
    .from('referrers')
    .select('code')
    .eq('email', email)
    .limit(1)
    .single()

  if (existing?.code) {
    return res.json({ code: existing.code, referral_link: `https://onecurrency.net/?ref=${existing.code}` })
  }

  const code = genCode()
  const { data, error } = await supabase
    .from('referrers')
    .insert({ email, code })
    .select('code')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ code: data.code, referral_link: `https://onecurrency.net/?ref=${data.code}` })
}
