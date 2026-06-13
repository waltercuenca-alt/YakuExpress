import { supabase } from '../supabase.js';

const STORAGE_KEY = 'yaku_turn_records_v1';

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function booleanValue(value) {
  return value === true || value === 'true';
}

export function normalizeCustomerWhatsapp(value) {
  return String(value || '')
    .replace(/[^\d+\-()\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidCustomerWhatsapp(value) {
  const normalized = normalizeCustomerWhatsapp(value);
  if (!normalized) return false;
  const digits = normalized.replace(/\D/g, '');
  if (digits.length === 9) return true;
  if (digits.startsWith('51') && digits.length === 11) return true;
  return digits.length >= 10 && digits.length <= 15;
}

export function maskCustomerWhatsapp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return `******${digits.slice(-3)}`;
}

function sanitizeLocalRecord(record) {
  const {
    customerWhatsapp,
    customer_whatsapp,
    notes,
    ...safeRecord
  } = record || {};
  return safeRecord;
}

function readAllLocalRecords() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    const sanitized = parsed.map(sanitizeLocalRecord);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return [];
  }
}

function writeAllLocalRecords(records) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.map(sanitizeLocalRecord)));
}

function buildLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTurnRecord(record, storage = 'localStorage') {
  const fullPassCount = numberValue(record.fullPassCount ?? record.full_pass_count);
  const hasFreePhotoBenefit = fullPassCount > 0;
  const isLocalRecord = storage === 'localStorage' || record.storage === 'localStorage';
  const customerWhatsapp = !isLocalRecord
    ? normalizeCustomerWhatsapp(record.customerWhatsapp ?? record.customer_whatsapp)
    : '';
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
    customerWhatsapp,
    notes: isLocalRecord ? '' : String(record.notes || '').trim(),
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
    customer_whatsapp: normalized.customerWhatsapp || null,
    notes: normalized.notes || null,
    source: 'registro-turno',
  };
}

function normalizeDbRecord(row) {
  return normalizeTurnRecord(row, 'supabase');
}

function isExpectedSupabaseSetupError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''} ${error?.code || ''}`.toLowerCase();
  return /turn_records|customer_whatsapp|schema cache|does not exist|relation|column|42p01|42703|pgrst/i.test(message);
}

function logSupabaseTurnRecordError(action, error) {
  const code = error?.code || 'unknown';
  const message = error?.message || 'Unknown Supabase error';
  console.warn(`Turn record cloud ${action} unavailable. Using local fallback.`, { code, message });
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
export function updateTurnRecordFollowUpLocal(recordId, updates) {
  try {
    if (!recordId) return { ok: false, storage: 'none', error: new Error('recordId requerido') };
    const current = readAllLocalRecords().map((item) => normalizeTurnRecord(item, item.storage || 'localStorage'));
    const index = current.findIndex((item) => item.id === recordId);
    if (index < 0) return { ok: false, storage: 'none', error: new Error('Registro local no encontrado') };
    const currentRecord = current[index];
    const nextRecord = normalizeTurnRecord({
      ...currentRecord,
      freePhotoRedeemed: booleanValue(updates.freePhotoRedeemed ?? updates.free_photo_redeemed),
      purchasedExtraPhotos: booleanValue(updates.purchasedExtraPhotos ?? updates.purchased_extra_photos),
      customerWhatsapp: '',
      notes: '',
      updatedAt: new Date().toISOString(),
      storage: 'localStorage',
    }, 'localStorage');
    const next = [...current];
    next[index] = nextRecord;
    writeAllLocalRecords(next);
    return { ok: true, storage: 'localStorage', data: nextRecord };
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
    logSupabaseTurnRecordError('save', error);
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
    logSupabaseTurnRecordError('list', error);
    return listTurnRecordsLocalByDate(date);
  }
}
export async function updateTurnRecordFollowUp(recordId, updates = {}) {
  if (!recordId) return { ok: false, storage: 'none', error: new Error('recordId requerido') };
  const followUpPayload = {
    free_photo_redeemed: booleanValue(updates.freePhotoRedeemed ?? updates.free_photo_redeemed),
    purchased_extra_photos: booleanValue(updates.purchasedExtraPhotos ?? updates.purchased_extra_photos),
    customer_whatsapp: normalizeCustomerWhatsapp(updates.customerWhatsapp ?? updates.customer_whatsapp) || null,
    notes: String(updates.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('turn_records')
      .update(followUpPayload)
      .eq('id', recordId)
      .select('*')
      .single();
    if (error) throw error;
    return { ok: true, storage: 'supabase', data: normalizeDbRecord(data) };
  } catch (error) {
    logSupabaseTurnRecordError('follow-up update', error);
    const localResult = updateTurnRecordFollowUpLocal(recordId, updates);
    if (localResult.ok) return localResult;
    return {
      ok: false,
      storage: 'none',
      error,
      message: 'Todavía no se puede actualizar en la nube. Falta habilitar edición segura.',
    };
  }
}
