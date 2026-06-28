import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const LEAGUE_ID = 'default'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export async function loadRemoteLeagueData() {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('league_state')
    .select('data')
    .eq('id', LEAGUE_ID)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.data ?? null
}

export async function saveRemoteLeagueData(data: unknown) {
  if (!supabase) return

  const { error } = await supabase
    .from('league_state')
    .upsert({
      id: LEAGUE_ID,
      data,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    throw error
  }
}
