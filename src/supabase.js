import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function syncOrderToSheets(code) {
  try {
    if (!code) return;
    await supabase.functions.invoke('sync-order', { body: { code } });
  } catch (error) {
    console.warn('Sheets sync pending:', error);
  }
}
