# Traspaso de Organiza

Guía para seguir editando Organiza. El detalle técnico está en `CLAUDE.md`, y
Claude Code lo lee solo al abrir el proyecto.

## Qué es

Calendario y horario personal de Master Wolf Labs. Calendario y Horario usan los
mismos datos, los eventos se filtran por áreas de vida (Mi relación, Dios,
Familia…) y lo variable ("una vez al mes") vive en **Por acomodar** hasta que se
agenda.

## Enlaces

- App publicada: https://app-organiza-six.vercel.app
- Código: https://github.com/masterwolflabs/App-Organiza
- Publicación: Vercel, equipo `Masterwolf`, proyecto `app-organiza`
- Base de datos: Supabase, proyecto `sistema financiero` (`uxozatzegnoczgiilvvc`)

## Estado

| Etapa | Estado |
|---|---|
| 1. Base: Hoy, Calendario, Horario, Por acomodar | Lista |
| 2. Áreas de vida, filtros, metas variables | Lista |
| 3. Semana tipo, horas libres, cruces, cambiar un solo día | Lista |
| 4. Agendar por voz con tarjeta de confirmación | Pendiente |
| 5. Revisión final en computador y celular | Pendiente |
| 6. Persona/Empresa, Daily, horario publicable, mundo por tarea, checklist, Ruta, tour | Lista |
| 7. Google, Apple, Notion, avisos e iPhone | Llaves de Google y `SUPABASE_SERVICE_ROLE_KEY` puestas en Vercel (2026-11-03, cliente OAuth "Organiza", app En producción). Falta que Emanuel conecte su cuenta. Conexiones vive en Configuración (`SETTINGS_PAGES` de `components/views/index.ts`). Resto: `docs/CONEXIONES.md` |

Pendientes concretos:

- La etapa 4 también cambia el repositorio `App-Master-Cloud`, donde vive la IA.
  La voz debe mostrar una tarjeta para confirmar antes de guardar.
- `model.ts` de la nube todavía no lee `exdates`. Hay que copiar ese cambio para
  que el calendario de la nube muestre bien un día cambiado.
- Los SQL `24` y `25` ya están aplicados en Supabase. Sus copias están en
  `docs/sql/` y faltan en la carpeta `supabase/` de `App-Master-Cloud`.
- La app ya está registrada en la nube (`docs/sql/26-registrar-organiza.sql`) y
  su dirección está autorizada en Supabase para entrar con Google. Si cambia la
  dirección, hay que actualizar ambas cosas.
- `app-organiza.vercel.app` es de otra persona. No la uses como enlace.
- Quedan textos que dicen "Master Finanzas" en notas y compartir. Conviene
  corregirlos en la plantilla.

## Preparar el computador

1. Pide acceso a `masterwolflabs/App-Organiza` en GitHub.
2. Instala [Node.js](https://nodejs.org) y
   [Claude Code](https://claude.com/claude-code).
3. Abre la Terminal y descarga el proyecto:

```bash
git clone https://github.com/masterwolflabs/App-Organiza.git
```

4. Entra a la carpeta e instala lo que necesita:

```bash
cd App-Organiza
```

```bash
npm install
```

5. Abre la app en tu computador, en `http://localhost:3000`:

```bash
npm run dev
```

6. En otra ventana de Terminal, dentro de la misma carpeta, abre Claude Code y
   pide lo que quieras cambiar:

```bash
claude
```

## Trabajar sin romper nada

- Antes de empezar, trae lo último con `git pull`.
- Todo lo que llega a `main` se publica solo en Vercel. Prueba en
  `http://localhost:3000` antes de subir.
- La base de datos es **real y compartida** con Finance y App Master Cloud. Lo que
  cambies ahí afecta a todas las apps, incluso desde tu computador.
- Los cambios de base de datos solo agregan cosas. No borres tablas ni columnas.
- Las claves privadas nunca van en el código. Las de IA viven solo en la nube.
- Para traer mejoras de la plantilla: `npm run update:template`.
