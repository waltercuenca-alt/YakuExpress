function cleanText(value, fallback = '-') {
  const text = String(value || '').trim();
  return text || fallback;
}

function cleanBooleanLabel(value) {
  return value === true ? 'sí' : 'no';
}

function cleanNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeWhatsappMask(value) {
  const text = String(value || '').trim();
  if (!text) return 'No registrado';
  const digits = text.replace(/\D/g, '');
  if (!digits) return 'Registrado';
  return `****${digits.slice(-4)}`;
}

function validatePayload(body = {}) {
  const date = cleanText(body.date, '');
  const turnTime = cleanText(body.turnTime, '');
  const photoCode = cleanText(body.photoCode, '');
  const totalPeople = cleanNumber(body.totalPeople);

  if (!date || !turnTime || !photoCode || totalPeople <= 0) {
    return null;
  }

  return {
    date,
    turnTime,
    photoCode,
    totalPeople,
    hasPhotos: body.hasPhotos === true,
    hasFullPass: body.hasFullPass === true,
    whatsapp: normalizeWhatsappMask(body.whatsapp),
  };
}

function buildMessage(payload) {
  return [
    '📸 Nuevo registro de grupo - YakuExpress',
    '',
    `Fecha: ${payload.date}`,
    `Horario: ${payload.turnTime}`,
    `Código: ${payload.photoCode}`,
    `Personas: ${payload.totalPeople}`,
    `Fotos: ${cleanBooleanLabel(payload.hasPhotos)}`,
    `Full Pass: ${cleanBooleanLabel(payload.hasFullPass)}`,
    `WhatsApp: ${payload.whatsapp}`,
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const payload = validatePayload(body);
  if (!payload) {
    return res.status(400).json({ ok: false, error: 'invalid_payload' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(200).json({ ok: false, disabled: true });
  }

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(payload),
        disable_web_page_preview: true,
      }),
    });

    if (!telegramResponse.ok) {
      return res.status(200).json({ ok: false, telegramError: true });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: false, telegramError: true });
  }
}
