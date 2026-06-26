import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase configuration variables are missing. Please verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in frontend/.env")
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
