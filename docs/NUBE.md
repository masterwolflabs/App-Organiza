# Conexión con App Master Cloud

| Qué | Cómo |
|---|---|
| Login compartido | Mismo Supabase. La nube abre la app con `#access_token=…&refresh_token=…`; `supabase-js` (config normal) lo lee y lo borra de la barra. |
| App → nube | `openCloud()` en `utils/cloud.ts` → `https://app-master-cloud.vercel.app/auth/sso#…`. |
| Uso de la app | `touchApp()` → `cloud_touch_app(slug)`. Alimenta los usuarios por app de la Mente. |
| Rol del usuario | `cloud_my_roles()`: rol con `app = slug` (Mente Singular) o `app = null` (Mente Maestra). |
| Resumen | `cloud_overview(slug)`: exige 2FA (aal2). |
| Laboratorio | Lectura de `cloud_feature_flags` (`app = slug` o `null`); escritura con `cloud_set_flag` (dueño/admin + 2FA reciente). |
| Auditoría | `cloud_audit_log` filtrado por `app = slug` (dueño/admin). Escrita solo por funciones `cloud_*`. |
| Perfil | Tabla `profiles` (la misma de Finance): `displayName`, `avatarUrl`. |
| Vistas de tablas | `app_table_views` (app + usuario + tabla). |
| Bases de datos | `app_databases` / `app_database_rows` (app + usuario). |

El SQL de todo esto vive en el repo de la nube: `supabase/03-nucleo-nube.sql` y `supabase/05-bases-de-datos-apps.sql`.
