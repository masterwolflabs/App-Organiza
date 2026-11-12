# Organiza para Mac (Tauri)

Una "cáscara" que abre la Organiza publicada (https://app-organiza.vercel.app). Todo lo de la web llega solo,
sin reinstalar. Aquí vive lo propio del Mac (ver `src-tauri/src/lib.rs`):

- Ícono en la barra de arriba: Abrir · Hoy · Horario · Daily · Calendario · Abrir al prender el Mac · Buscar actualizaciones · Salir.
- **⌥ + Espacio** muestra / esconde la ventana desde cualquier parte.
- Cerrar la ventana NO cierra la app: sigue de fondo para que avisos, alarmas y el focus que se abre solo funcionen aunque Chrome esté cerrado. Salir: menú del ícono o ⌘Q.
- Sin App Nap (macOS no la adormece de fondo).
- La web habla con la app por `lib/desktop.ts` (`notify`, `focus_mode`, `bring_to_front`).
- Se abre sola al prender el Mac (encendido la primera vez).
- Se actualiza sola desde GitHub Releases (`latest.json`), firmado con la llave de `~/.config/master-wolf/organiza-updater.key` (Mac de Emanuel; NO va al repo).

## Armar una versión nueva (Claude)
1. Subir `version` en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
2. `. "$HOME/.cargo/env"; cd desktop && npm install`
3. `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.config/master-wolf/organiza-updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npx tauri build`
4. Release en GitHub (`gh release create organiza-mac-vX.Y.Z`) con el `.dmg`, `Organiza.app.tar.gz`, su `.sig` y un `latest.json`.

Sin firma de Apple (decisión 12 nov): la primera vez se abre con clic derecho → Abrir.
