const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'dc6bvu7hs';
const apiKey = Deno.env.get('CLOUDINARY_API_KEY') || '';
const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors({});

  try {
    if (req.method !== 'POST') {
      return cors({ ok: false, error: 'Method not allowed' });
    }

    const body = await req.json().catch(() => ({}));
    const customerCode = sanitizeCode(body.code);
    const folder = `yakupark/clientes/${customerCode}`;

    console.log('[list-client-photos] request', {
      code: body.code,
      sanitizedCode: customerCode,
      folder,
      cloudName,
      hasApiKey: Boolean(apiKey),
      hasApiSecret: Boolean(apiSecret),
    });

    if (!customerCode) {
      return cors({ ok: false, error: 'code is required', folder });
    }
    if (!apiKey || !apiSecret) {
      return cors({
        ok: false,
        error: 'Missing Cloudinary credentials',
        folder,
        diagnostics: { hasApiKey: Boolean(apiKey), hasApiSecret: Boolean(apiSecret) },
      });
    }

    const { resources, source, diagnostics } = await listCloudinaryFolder(folder);
    const photos = resources.map((resource, index) => toPhoto(resource, index));

    console.log('[list-client-photos] result', {
      code: customerCode,
      folder,
      source,
      count: photos.length,
      diagnostics,
    });

    return cors({
      ok: true,
      code: customerCode,
      folder,
      source,
      count: photos.length,
      photos,
      diagnostics,
    });
  } catch (error) {
    console.error('[list-client-photos] fatal error', error);
    return cors({
      ok: false,
      error: String(error?.message || error),
      stack: String(error?.stack || ''),
    });
  }
});

async function listCloudinaryFolder(folder: string) {
  const searchResult = await searchByAssetFolder(folder);
  if (searchResult.resources.length) {
    return {
      resources: searchResult.resources,
      source: 'search_api_asset_folder',
      diagnostics: {
        searchApi: searchResult.diagnostics,
      },
    };
  }

  const prefixResult = await listByPublicIdPrefix(`${folder}/`);
  return {
    resources: prefixResult.resources,
    source: 'admin_api_prefix',
    diagnostics: {
      searchApi: searchResult.diagnostics,
      prefixApi: prefixResult.diagnostics,
    },
  };
}

async function searchByAssetFolder(folder: string) {
  const resources: any[] = [];
  const diagnostics: any[] = [];
  let nextCursor = '';

  do {
    const body: Record<string, unknown> = {
      expression: `resource_type:image AND asset_folder="${folder}"`,
      max_results: 100,
      sort_by: [{ public_id: 'asc' }],
    };
    if (nextCursor) body.next_cursor = nextCursor;

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    diagnostics.push({
      method: 'search',
      folder,
      status: response.status,
      ok: response.ok,
      error: payload?.error?.message || null,
      resourceCount: Array.isArray(payload.resources) ? payload.resources.length : 0,
      nextCursor: payload.next_cursor || null,
    });
    console.log('[list-client-photos] Cloudinary search response', diagnostics[diagnostics.length - 1]);

    if (!response.ok) {
      return { resources: [], diagnostics };
    }

    resources.push(...(Array.isArray(payload.resources) ? payload.resources : []));
    nextCursor = payload.next_cursor || '';
  } while (nextCursor);

  return { resources: sortResources(resources), diagnostics };
}

async function listByPublicIdPrefix(prefix: string) {
  const resources: any[] = [];
  const diagnostics: any[] = [];
  let nextCursor = '';

  do {
    const params = new URLSearchParams({
      prefix,
      max_results: '100',
      type: 'upload',
    });
    if (nextCursor) params.set('next_cursor', nextCursor);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params.toString()}`,
      {
        headers: { Authorization: basicAuth() },
      },
    );

    const payload = await response.json().catch(() => ({}));
    diagnostics.push({
      method: 'prefix',
      prefix,
      status: response.status,
      ok: response.ok,
      error: payload?.error?.message || null,
      resourceCount: Array.isArray(payload.resources) ? payload.resources.length : 0,
      nextCursor: payload.next_cursor || null,
    });
    console.log('[list-client-photos] Cloudinary prefix response', diagnostics[diagnostics.length - 1]);

    if (!response.ok) {
      return { resources: [], diagnostics };
    }

    resources.push(...(Array.isArray(payload.resources) ? payload.resources : []));
    nextCursor = payload.next_cursor || '';
  } while (nextCursor);

  return { resources: sortResources(resources), diagnostics };
}

function toPhoto(resource: any, index: number) {
  const publicId = String(resource.public_id || '');
  const format = String(resource.format || 'jpg');
  const versionPath = resource.version ? `v${resource.version}/` : '';
  const encodedPublicId = publicId.split('/').map(encodeURIComponent).join('/');
  const basePath = `https://res.cloudinary.com/${cloudName}/image/upload`;

  return {
    id: publicId || `photo-${index + 1}`,
    number: index + 1,
    publicId,
    assetFolder: resource.asset_folder || null,
    format,
    bytes: resource.bytes || 0,
    width: resource.width || null,
    height: resource.height || null,
    createdAt: resource.created_at || null,
    fullUrl: `${basePath}/f_auto,q_auto/${versionPath}${encodedPublicId}.${format}`,
    thumbUrl: `${basePath}/c_fill,w_620,h_460,g_auto,f_auto,q_auto/${versionPath}${encodedPublicId}.${format}`,
  };
}

function sortResources(resources: any[]) {
  return resources.sort((a, b) => String(a.public_id).localeCompare(String(b.public_id), undefined, { numeric: true }));
}

function sanitizeCode(code: unknown) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function basicAuth() {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

function cors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}
