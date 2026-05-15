# YakuExpress

Pre-registro rapido por caja para Yakupark. App React + Vite con Supabase como motor principal y Google Sheets como respaldo/analytics.

## Correr localmente

1. Copia `.env.example` a `.env`.
2. Instala dependencias:

```bash
npm install
```

3. Corre la app:

```bash
npm run dev
```

Rutas:

- `/cliente`: flujo del visitante
- `/caja`: panel de caja
- `/marketing`: dashboard

## Supabase

Proyecto:

- `SUPABASE_URL=https://zvctwvwmiwkcrhzviasy.supabase.co`
- `SUPABASE_PROJECT_REF=zvctwvwmiwkcrhzviasy`
- anon key en `.env.example`

Aplica el SQL de `supabase/migrations/001_yakuexpress.sql` en Supabase SQL Editor.

El SQL crea:

- `orders`
- `order_items`
- `staff_users`
- `staff_sessions`
- secuencia `YAKU-0001`
- RLS activado en todas las tablas
- RPCs seguras para cliente, caja y marketing
- usuarios iniciales:
  - caja / `yaku123`
  - admin / `admin123`

No se usa `service_role` en el frontend. La app publica solo usa la anon key y llama RPCs con `security definer`.

## Google Sheets

Sheet:

- ID: `1sxaGQEr-hCP02Hj9Zjiu8Ud9PmH8xSq2fino-UTWD78`
- Nombre: `Pedidos_YakuExpress`
- Pestañas: `Pedidos`, `Reporte Diario`, `Configuración`

La sincronizacion se hace con la Edge Function `supabase/functions/sync-order`, no con Google Apps Script.

Configura secretos en Supabase:

```bash
supabase secrets set GOOGLE_SHEET_ID=1sxaGQEr-hCP02Hj9Zjiu8Ud9PmH8xSq2fino-UTWD78
supabase secrets set GOOGLE_SHEET_NAME=Pedidos_YakuExpress
supabase secrets set GOOGLE_SHEET_TAB=Pedidos
supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL=tu-service-account@proyecto.iam.gserviceaccount.com
supabase secrets set GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

Comparte el Google Sheet con el email del service account como editor.

Deploy de la funcion:

```bash
supabase functions deploy sync-order --project-ref zvctwvwmiwkcrhzviasy
```

Cada pedido creado y cada cambio de estado intentan sincronizarse automaticamente. Si Sheets falla, Supabase sigue siendo la fuente principal.

## Deploy a GitHub Pages

1. Ajusta `base` en `vite.config.js` si el repo no se llama `YakuExpress`.
2. Build:

```bash
npm run build
```

3. Publica `dist` en GitHub Pages con GitHub Actions o con la opcion "Deploy from a branch" si copias el build a la rama configurada.

`public/404.html` permite que rutas como `/caja` y `/marketing` funcionen al refrescar en GitHub Pages. No se incluye `gh-pages` como dependencia para mantener el proyecto liviano.

## Variables de entorno

Frontend:

```env
VITE_SUPABASE_URL=https://zvctwvwmiwkcrhzviasy.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_tV_7yikpYkuUADD0zyRkDQ_adT-MwpB
VITE_GOOGLE_SHEET_ID=1sxaGQEr-hCP02Hj9Zjiu8Ud9PmH8xSq2fino-UTWD78
VITE_GOOGLE_SHEET_NAME=Pedidos_YakuExpress
```

Edge Function:

```env
GOOGLE_SHEET_ID
GOOGLE_SHEET_NAME
GOOGLE_SHEET_TAB
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Notas de seguridad

- RLS queda activado y las tablas no se leen directamente desde el frontend.
- Los pedidos se crean mediante RPC.
- Caja y marketing usan sesiones temporales creadas por RPC.
- `service_role` y credenciales Google solo viven como secretos de Supabase Edge Functions.
