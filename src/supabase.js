import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zvctwvwmiwkcrhzviasy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_tV_7yikpYkuUADD0zyRkDQ_adT-MwpB';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function syncOrderToSheets(code) {
  try {
    if (!code) return;
    await supabase.functions.invoke('sync-order', { body: { code } });
  } catch (error) {
    console.warn('Sheets sync pending:', error);
  }
}
