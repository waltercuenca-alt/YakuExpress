import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sheetId = Deno.env.get('GOOGLE_SHEET_ID') || '1sxaGQEr-hCP02Hj9Zjiu8Ud9PmH8xSq2fino-UTWD78';
const sheetName = Deno.env.get('GOOGLE_SHEET_NAME') || 'Pedidos_YakuExpress';
const tabName = Deno.env.get('GOOGLE_SHEET_TAB') || 'Pedidos';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors({});
  try {
    const { code } = await req.json();
    if (!code) throw new Error('code is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data, error } = await supabase.rpc('get_order_payload', { p_code: code });
    if (error) throw error;
    if (!data) throw new Error('order not found');

    const accessToken = await googleAccessToken();
    const row = [
      data.created_at,
      data.code,
      data.status,
      data.customer_name,
      data.document_number,
      data.phone,
      data.email,
      data.receipt_type,
      (data.items || []).map((item: any) => `${item.product_name} (${item.slot})`).join(' | '),
      data.photo_pack,
      data.payment_method,
      data.total,
      data.comments || '',
      data.expires_at,
    ];

    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}!A:N:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const sheetResp = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    });
    if (!sheetResp.ok) throw new Error(await sheetResp.text());

    return cors({ ok: true, sheetName, code });
  } catch (error) {
    return cors({ ok: false, error: String(error?.message || error) }, 500);
  }
});

async function googleAccessToken() {
  const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = (Deno.env.get('GOOGLE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('Missing Google service account secrets');

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signature = await sign(`${header}.${claim}`, privateKey);
  const assertion = `${header}.${claim}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function sign(input: string, privateKey: string) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return base64Url(signature);
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}
