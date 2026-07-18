import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Configure Supabase client with site URL for proper auth flow handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    flowType: 'pkce',
    siteUrl: 'https://proappadmin.netlify.app',
  },
});
