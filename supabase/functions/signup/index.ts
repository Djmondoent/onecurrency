import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE')!
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const { email, ref } = await req.json()
  if (!email || !/.+@.+/.test(email)) {
    return new Response(JSON.stringify({ error: 'email required' }), { status: 400 })
  }

  let refCode: string | null = null
  if (ref) {
    const { data } = await supabase.from('referrers').select('code').eq('code', ref).limit(1).maybeSingle()
    if (data?.code) refCode = data.code
  }

  const { error } = await supabase.from('signups').insert({ email, ref_code: refCode })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return Response.json({ ok: true })
})
