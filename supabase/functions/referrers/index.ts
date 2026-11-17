import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE')!
)

const genCode = () => Math.random().toString(36).slice(2, 10)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const { email } = await req.json()
  if (!email || !/.+@.+/.test(email)) {
    return new Response(JSON.stringify({ error: 'email required' }), { status: 400 })
  }

  const { data: existing } = await supabase
    .from('referrers')
    .select('code')
    .eq('email', email)
    .limit(1)
    .maybeSingle()

  if (existing?.code) {
    return Response.json({ code: existing.code, referral_link: `https://onecurrency.net/?ref=${existing.code}` })
  }

  const code = genCode()
  const { data, error } = await supabase
    .from('referrers')
    .insert({ email, code })
    .select('code')
    .single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return Response.json({ code: data.code, referral_link: `https://onecurrency.net/?ref=${data.code}` })
})
