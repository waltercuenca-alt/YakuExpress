import { supabase } from '../supabase.js';

const STORAGE_KEY = 'yaku_turn_records_v1';

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function booleanValue(value) {
  return value === true || value === 'true';
}

function readAllLocalRecords() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllLocalRecords(records) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function buildLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTurnRecord(record, storage = 'localStorage') {
  const fullPassCount = numberValue(record.fullPassCount ?? record.full_pass_count);
  const hasFreePhotoBenefit = fullPassCount > 0;
  return {
    id: record.id || buildLocalId(),
    date: record.date || record.record_date || '',
    turnTime: record.turnTime || record.turn_time || '',
    photoCode: String(record.photoCode || record.photo_code || '').trim().toUpperCase(),
    totalPeople: numberValue(record.totalPeople ?? record.total_people),
    standardCount: numberValue(record.standardCount ?? record.standard_count),
    fullPassCount,
    kidsCount: numberValue(record.kidsCount ?? record.kids_count),
    premiumKidsCount: numberValue(record.premiumKidsCount ?? record.premium_kids_count),
    fullDayCount: numberValue(record.fullDayCount ?? record.full_day_count),
    yakutoboganCount: numberValue(record.yakutoboganCount ?? record.yakutobogan_count),
    hasFreePhotoBenefit,
    freePhotoRedeemed: hasFreePhotoBenefit ? booleanValue(record.freePhotoRedeemed ?? record.free_photo_redeemed) : false,
    purchasedExtraPhotos: booleanValue(record.purchasedExtraPhotos ?? record.purchased_extra_photos),
    notes: String(record.notes || '').trim(),
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    updatedAt: record.updatedAt || record.updated_at || null,
    storage: record.storage || storage,
  };
}

export function normalizeTurnRecordForDb(record) {
  const normalized = normalizeTurnRecord(record, 'supabase');
  return {
    id: normalized.id,
    record_date: normalized.date,
    turn_time: normalized.turnTime,
    photo_code: normalized.photoCode,
    total_people: normalized.totalPeople,
    standard_count: normalized.standardCount,
    full_pass_count: normalized.fullPassCount,
    kids_count: normalized.kidsCount,
    premium_kids_count: normalized.premiumKidsCount,
    full_day_count: normalized.fullDayCount,
    yakutobogan_count: normalized.yakutoboganCount,
    has_free_photo_benefit: normalized.hasFreePhotoBenefit,
    free_photo_redeemed: normalized.freePhotoRedeemed,
    purchased_extra_photos: normalized.purchasedExtraPhotos,
    notes: normalized.notes || null,
    source: 'registro-turno',
  };
}

function normalizeDbRecord(row) {
  return normalizeTurnRecord(row, 'supabase');
}

function isExpectedSupabaseSetupError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''} ${error?.code || ''}`.toLowerCase();
  return /turn_records|schema cache|does not exist|relation|42p01|pgrst/i.test(message);
}

export function saveTurnRecordLocal(record) {
  try {
    const normalized = normalizeTurnRecord(record, 'localStorage');
    const current = readAllLocalRecords().map((item) => normalizeTurnRecord(item, item.storage || 'localStorage'));
    const next = [normalized, ...current.filter((item) => item.id !== normalized.id)];
    writeAllLocalRecords(next);
    return { ok: true, storage: 'localStorage', data: normalized };
  } catch (error) {
    return { ok: false, storage: 'none', error };
  }
}

export function listTurnRecordsLocalByDate(date) {
  try {
    const data = readAllLocalRecords()
      .map((item) => normalizeTurnRecord(item, item.storage || 'localStorage'))
      .filter((item) => item.date === date)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return { ok: true, storage: 'localStorage', data };
  } catch (error) {
    return { ok: false, storage: 'none', error };
  }
}

export async function saveTurnRecord(record) {
  try {
    const payload = normalizeTurnRecordForDb(record);
    const { data, error } = await supabase
      .from('turn_records')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return { ok: true, storage: 'supabase', data: normalizeDbRecord(data) };
  } catch (error) {
    if (!isExpectedSupabaseSetupError(error)) {
      console.warn('Turn record cloud save unavailable. Using local fallback.');
    }
    return saveTurnRecordLocal(record);
  }
}

export async function listTurnRecordsByDate(date) {
  try {
    const { data, error } = await supabase
      .from('turn_records')
      .select('*')
      .eq('record_date', date)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { ok: true, storage: 'supabase', data: (data || []).map(normalizeDbRecord) };
  } catch (error) {
    if (!isExpectedSupabaseSetupError(error)) {
      console.warn('Turn record cloud list unavailable. Using local fallback.');
    }
    return listTurnRecordsLocalByDate(date);
  }
}