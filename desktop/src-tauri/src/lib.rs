//! Organiza para Mac (Emanuel, 2026-11-12). Una cáscara que abre la Organiza publicada:
//! todo lo de la web llega solo; aquí vive lo propio del Mac.
//! - Ícono arriba (barra de menú) con accesos y «Abrir al prender el Mac».
//! - ⌥+Espacio muestra / esconde la ventana desde cualquier parte.
//! - Cerrar la ventana NO cierra la app: queda corriendo de fondo, así los avisos, las alarmas y el
//!   focus que se abre solo siguen funcionando aunque Chrome esté cerrado. (Salir: menú del ícono o ⌘Q.)
//! - Comandos que llama la web: `notify` (aviso nativo), `focus_mode` (ventana al frente y siempre encima).
//! - Sin App Nap: macOS no adormece la app de fondo (si no, los relojes de la página se atrasan).
//! - Se actualiza sola: busca versiones nuevas en GitHub Releases al abrir y cada 6 h.

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn show(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let visible = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false);
        if visible {
            let _ = w.hide();
        } else {
            show(app);
        }
    }
}

/// Lleva la página a una sección («#daily», «#horario»…).
fn go(app: &AppHandle, hash: &str) {
    show(app);
    if let Some(w) = main_window(app) {
        let _ = w.eval(&format!("location.hash = '{}'", hash.replace('\'', "")));
    }
}

/// Aviso nativo del Mac (la web lo pide cuando corre dentro de la app).
#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Modo focus: al abrirse trae la ventana al frente y la deja encima de las demás apps; al cerrarse la suelta.
#[tauri::command]
fn focus_mode(app: AppHandle, on: bool) {
    if let Some(w) = main_window(&app) {
        if on {
            show(&app);
        }
        let _ = w.set_always_on_top(on);
    }
}

/// Muestra la ventana (por ejemplo, cuando suena una alarma).
#[tauri::command]
fn bring_to_front(app: AppHandle) {
    show(&app);
}

/// Busca una versión nueva de la app de Mac. `manual` = la pidió la persona (avisa también si no hay).
async fn check_update(app: AppHandle, manual: bool) {
    let Ok(updater) = app.updater() else { return };
    match updater.check().await {
        Ok(Some(update)) => {
            let ok = app
                .dialog()
                .message(format!("Hay una versión nueva de Organiza para Mac ({}). ¿Actualizar ahora? Tarda unos segundos.", update.version))
                .title("Organiza")
                .buttons(MessageDialogButtons::OkCancelCustom("Actualizar".into(), "Después".into()))
                .blocking_show();
            if ok && update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                app.restart();
            }
        }
        Ok(None) => {
            if manual {
                app.dialog().message("Ya tienes la última versión de Organiza para Mac.").title("Organiza").blocking_show();
            }
        }
        Err(e) => {
            if manual {
                app.dialog().message(format!("No se pudo buscar actualizaciones: {e}")).title("Organiza").blocking_show();
            }
        }
    }
}

/// Que macOS no adormezca la app cuando está de fondo (App Nap): los avisos y el focus dependen de sus relojes.
#[cfg(target_os = "macos")]
fn keep_awake() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    let info = NSProcessInfo::processInfo();
    let reason = NSString::from_str("Organiza: avisos, alarmas y focus a su hora");
    let token = info.beginActivityWithOptions_reason(NSActivityOptions::UserInitiatedAllowingIdleSystemSleep, &reason);
    std::mem::forget(token);
}
#[cfg(not(target_os = "macos"))]
fn keep_awake() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle_key = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let app = tauri::Builder::default()
        // Abrirla de nuevo con la app ya abierta solo muestra la ventana (nunca dos copias).
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, ev| {
                    if sc == &toggle_key && ev.state() == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![notify, focus_mode, bring_to_front])
        .setup(move |app| {
            keep_awake();
            let handle = app.handle().clone();
            let _ = app.global_shortcut().register(toggle_key);

            // Abrir al prender el Mac: encendido por defecto la primera vez.
            let autostart = app.autolaunch();
            let first = !app.path().app_config_dir().map(|d| d.join(".iniciada").exists()).unwrap_or(true);
            // Solo la versión final (la de prueba no se registra para abrirse al prender el Mac).
            if first && !cfg!(debug_assertions) {
                let _ = autostart.enable();
                if let Ok(d) = app.path().app_config_dir() {
                    let _ = std::fs::create_dir_all(&d);
                    let _ = std::fs::write(d.join(".iniciada"), "1");
                }
            }
            let on_login = autostart.is_enabled().unwrap_or(false);

            // Menú del ícono de arriba.
            let open = MenuItem::with_id(app, "abrir", "Abrir Organiza   ⌥ Espacio", true, None::<&str>)?;
            let hoy = MenuItem::with_id(app, "inicio", "Hoy", true, None::<&str>)?;
            let horario = MenuItem::with_id(app, "horario", "Horario", true, None::<&str>)?;
            let daily = MenuItem::with_id(app, "daily", "Daily", true, None::<&str>)?;
            let cal = MenuItem::with_id(app, "calendario", "Calendario", true, None::<&str>)?;
            let login = CheckMenuItem::with_id(app, "login", "Abrir al prender el Mac", true, on_login, None::<&str>)?;
            let upd = MenuItem::with_id(app, "update", "Buscar actualizaciones…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "salir", "Salir de Organiza", true, None::<&str>)?;
            let sep = || PredefinedMenuItem::separator(app);
            let menu = Menu::with_items(app, &[&open, &sep()?, &hoy, &horario, &daily, &cal, &sep()?, &login, &upd, &sep()?, &quit])?;
            let login_item = login.clone();
            TrayIconBuilder::with_id("organiza")
                .icon(app.default_window_icon().cloned().expect("ícono"))
                .icon_as_template(false)
                .tooltip("Organiza")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "abrir" => show(app),
                    "inicio" | "horario" | "daily" | "calendario" => go(app, &format!("#{}", ev.id().as_ref())),
                    "login" => {
                        let al = app.autolaunch();
                        let on = al.is_enabled().unwrap_or(false);
                        let _ = if on { al.disable() } else { al.enable() };
                        let _ = login_item.set_checked(!on);
                    }
                    "update" => {
                        let a = app.clone();
                        tauri::async_runtime::spawn(async move { check_update(a, true).await });
                    }
                    "salir" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = ev {
                        show(tray.app_handle());
                    }
                    let _ = MouseButtonState::Up;
                })
                .build(app)?;

            // Actualizaciones: al abrir (después de 20 s) y cada 6 horas.
            tauri::async_runtime::spawn(async move {
                tokio_sleep(20).await;
                loop {
                    check_update(handle.clone(), false).await;
                    tokio_sleep(6 * 3600).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, ev| {
            // Cerrar = esconder: la app sigue de fondo para avisar a la hora.
            if let WindowEvent::CloseRequested { api, .. } = ev {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("no se pudo abrir Organiza");

    app.run(|app, ev| {
        // Clic en el ícono del Dock con la ventana escondida: la muestra.
        if let RunEvent::Reopen { .. } = ev {
            show(app);
        }
    });
}

async fn tokio_sleep(secs: u64) {
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(secs));
        let _ = tx.send(());
    });
    let _ = tauri::async_runtime::spawn_blocking(move || rx.recv()).await;
}
