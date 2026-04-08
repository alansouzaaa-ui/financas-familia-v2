import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wmisuthjiwrojjsbtlbm.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtaXN1dGhqaXdyb2pqc2J0bGJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDczMzIsImV4cCI6MjA5MTE4MzMzMn0.fs06dV6ZABNVabN9crv_08uQe5ZneEFsMY9K-5yLI90'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
export const isSupabaseConfigured = true
