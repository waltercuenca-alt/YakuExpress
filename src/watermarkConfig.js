import { supabase } from './supabase.js';

export const WATERMARK_STORAGE_KEY = 'yaku_watermark_enabled';
export const WATERMARK_CHANGE_EVENT = 'yaku-watermark-change';
export const WATERMARK_SETTING_KEY = 'watermark_enabled';

export function getWatermarkEnabled() {
  try {
    const storedValue = window.localStorage.getItem(WATERMARK_STORAGE_KEY);
    return storedValue !== 'false';
  } catch (error) {
    console.error('YakuExpress watermark preference read error:', error);
    return true;
  }
}

export function setWatermarkEnabled(enabled) {
  try {
    window.localStorage.setItem(WATERMARK_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(WATERMARK_CHANGE_EVENT, { detail: enabled }));
  } catch (error) {
    console.error('YakuExpress watermark preference write error:', error);
  }
}

export async function loadGlobalWatermarkEnabled() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', WATERMARK_SETTING_KEY)
      .maybeSingle();
    if (error) throw error;
    const enabled = settingValueToBoolean(data?.value);
    setWatermarkEnabled(enabled);
    return { enabled, source: 'global' };
  } catch (error) {
    console.warn('YakuExpress watermark global preference unavailable:', error);
    return { enabled: getWatermarkEnabled(), source: 'local' };
  }
}

export async function saveGlobalWatermarkEnabled(enabled) {
  setWatermarkEnabled(enabled);
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: WATERMARK_SETTING_KEY,
        value: enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    if (error) throw error;
    return { enabled, source: 'global' };
  } catch (error) {
    console.warn('YakuExpress watermark global preference save unavailable:', error);
    return { enabled, source: 'local' };
  }
}

function settingValueToBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && typeof value.enabled === 'boolean') return value.enabled;
  return true;
}
