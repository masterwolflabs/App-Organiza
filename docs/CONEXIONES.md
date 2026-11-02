# Conexiones e instalación en el iPhone

Todo el código ya está publicado. Faltan las llaves, y esas las pone una persona.
Las llaves van en Vercel → equipo `Masterwolf` → proyecto `app-organiza` →
Settings → Environment Variables. Nunca por el chat.

## 1. Llave de servicio (la necesitan Google, Apple, Notion y los avisos)

1. Abre https://supabase.com/dashboard/project/uxozatzegnoczgiilvvc/settings/api-keys
2. Copia la `service_role`.
3. Pégala en Vercel como `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Google Calendar

1. Activa la API: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   (en el proyecto de Google que ya se usa para el login).
2. En https://console.cloud.google.com/auth/clients abre el cliente web y agrega
   esta dirección de redirección: `https://app-organiza-six.vercel.app/api/google/callback`
3. En https://console.cloud.google.com/auth/audience toca **Publicar app**. En modo
   prueba Google desconecta cada 7 días. Al conectar saldrá "app no verificada":
   Avanzado → Continuar.
4. En Vercel: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

## 3. Calendario de Apple

- Completo: iPhone → Ajustes → Calendario → Cuentas → agregar la cuenta de Google.
- Sin Google: Organiza → Conexiones → "Suscribirme en Apple" (solo se lee).

## 4. Notion

1. Crea una integración pública en https://www.notion.so/profile/integrations
2. Redirección: `https://app-organiza-six.vercel.app/api/notion/callback`
3. En Vercel: `NOTION_CLIENT_ID` y `NOTION_CLIENT_SECRET`.
4. Organiza → Conexiones → Conectar Notion → elige la base **Horario** → Traer.
   Así entra el horario completo de Emanuel; "Plantilla Emanuel" solo trae lo que
   se veía en la foto.

Notion va en un sentido: Notion → Organiza. Volver a traer una base actualiza sus
filas y conserva lo agregado en Organiza.

## 5. Avisos con la app cerrada

1. En la Terminal, dentro de la carpeta del proyecto:

```bash
npx web-push generate-vapid-keys
```

2. En Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `CRON_SECRET`
   (una clave larga inventada).
3. Crea un cron que cada minuto haga `POST` a
   `https://app-organiza-six.vercel.app/api/push/tick` con el encabezado
   `Authorization: Bearer <CRON_SECRET>`. Sirve pg_cron con pg_net en Supabase o
   cron-job.org. El plan Hobby de Vercel solo permite un cron al día.
4. Para Google con esa misma frecuencia baja: `POST /api/google/sync` con el mismo
   encabezado, cada 15 minutos. Sin esto, se sincroniza con "Sincronizar ahora".
5. Redeploy en Vercel, porque las variables `NEXT_PUBLIC_` entran al compilar.

## 6. Instalar en el iPhone

**Rápido (sin Mac):** abre la app en Safari → Compartir → Agregar a inicio. Luego
Conexiones → Activar avisos (iOS 16.4 o más nuevo).

**App real (`ios-app/`, con Mac):** es un contenedor de la app publicada. Los
avisos quedan programados en el teléfono y funcionan con la app cerrada.

1. Instala Xcode desde la App Store (este Mac tiene 15 GB libres: libera espacio antes).
2. Instala CocoaPods y activa Xcode:

```bash
brew install cocoapods
```

```bash
sudo xcode-select -s /Applications/Xcode.app
```

3. Genera el proyecto y ábrelo:

```bash
cd ios-app && npm install && npx cap add ios && npx cap sync ios && npx cap open ios
```

4. En Xcode: App → Signing & Capabilities → Team → tu Apple ID.
5. Conecta el iPhone por cable, elígelo arriba y toca ▶.
6. En el iPhone: Ajustes → General → VPN y dispositivos → confiar. Si lo pide,
   activa el Modo desarrollador en Privacidad y seguridad.

Con Apple ID gratis deja de abrir a los 7 días y se repite el paso 5. Con Apple
Developer (99 USD al año) dura hasta un año.
