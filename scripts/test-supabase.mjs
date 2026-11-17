import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main () {
  const { data, error } = await supabase.from('referrers').select('*').limit(5)
  console.log('data:', data)
  console.log('error:', error)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
