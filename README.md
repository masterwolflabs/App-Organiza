# Plantilla Master Wolf

La base de todas las apps de **Master Wolf Labs**, sacada de Master Wolf
Finance. Cada app nueva parte de aquí y queda conectada a
**App Master Cloud**: mismo login, mismo perfil y su propia Mente Singular.

## Qué trae (v0.2.0)
- **Diseño Finance:** luces ambientales, paneles de vidrio, números en neón y
  tipografía Bricolage Grotesque.
- **Apariencia configurable por cada usuario:** tema Sistema/Claro/Oscuro,
  paleta de 6 colores y color de las luces (o apagadas).
- **Navegación:** barra superior que se oculta, menú lateral tipo cajón, dock
  estilo macOS con el botón de la nube al centro, buscador ⌘K y
  atrás/adelante por sección.
- **Login compartido** con la nube: correo o Google. Desde la nube se entra
  directo, y el botón "Abrir App Master Cloud" pasa la sesión.
- **Centro de usuario:** Perfil (compartido con todas las apps), Seguridad y
  Configuración.
- **Mente Singular** (solo para quien tiene rol en esta app, con 2FA):
  Inicio, Laboratorio (funciones que se prenden y apagan) y Auditoría.
- **Tablas estilo Notion** (`<DataTable>`, de Empresa en Finance): vistas en
  pestañas (Tabla, Galería y Calendario), filtros, orden y búsqueda. Las
  columnas se ocultan, reordenan y ensanchan. Se pueden agregar columnas
  propias "+" (texto, número, selección, fecha, casilla, enlace o fórmula),
  relaciones entre tablas y resúmenes (contar, sumar, promedio…). Ejemplo en
  la sección **Registros**.
- **Ventanas tipo Notion** (`<Modal>`): flotante (se mueve y se agranda),
  lateral (empuja la página) o página completa.
- **Bases de datos** que crea el usuario: plantillas, columnas con tipo y
  fórmulas tipo Notion. Sección **Bases de datos**.
- Cada usuario guarda sus vistas y bases **por app**, separadas de Finance y
  de las otras apps.

## Crear una app nueva
1. En App Master Cloud → **Plantillas** → "Crear app con esta plantilla", o en
   GitHub → **Use this template**. Ponle nombre al repo (ej. `master-wolf-crm`).
2. Ábrelo con GitHub Desktop (**File → Clone repository**).
3. (Ya no hace falta configurar Supabase: la app trae las llaves públicas de
   la nube en `lib/supabaseClient.ts`.)
4. Edita **`app.config.ts`**: `slug`, nombre, color y secciones.
5. `npm install` y luego `npm run dev` → http://localhost:3000
6. En Vercel → **Add New Project** → importa el repo → **Deploy**. No necesita
   variables de entorno.
7. En Supabase, agrega la URL de Vercel en **Authentication → URL
   Configuration → Redirect URLs** (`https://tu-app.vercel.app/**`).
8. Regístrala en la nube: **Table Editor → `hub_apps`** con el mismo `slug`,
   su URL y `sso = true`.
9. Para administrarla: un dueño de la Mente Maestra le da un rol en
   `cloud_roles` (`app = 'tu-slug'`).

## Dónde se cambia cada cosa
| Quiero… | Archivo |
|---|---|
| Nombre, color, saludo, secciones | `app.config.ts` |
| Agregar una sección | `app.config.ts` (SECTIONS) + `components/views/` + `VIEWS` en `components/shell/AppShell.tsx` |
| Que algo aparezca en el buscador ⌘K | `getSearchItems` en `components/shell/AppShell.tsx` |
| Prender una función desde la Mente | `useFlag('clave')` de `utils/cloud.ts` |
| Mostrar datos en tabla estilo Notion | `<DataTable id="…" columns rows rowKey defaultViews>` (ver `components/views/RegistrosView.tsx`) |
| Abrir una ventana tipo Notion | `<Modal title onClose footer>` de `components/tables/ui.tsx` |
| Colores de la paleta y de las luces | bloque "APARIENCIA CONFIGURABLE" al final de `app/globals.css` |

Más detalle técnico en `CLAUDE.md` y `docs/NUBE.md`.
