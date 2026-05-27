export const WATERMARK_STORAGE_KEY = 'yaku_watermark_enabled';
export const WATERMARK_CHANGE_EVENT = 'yaku-watermark-change';

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
