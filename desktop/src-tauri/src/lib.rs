//! Organiza para Mac (Emanuel, 2026-11-12). Una cáscara que abre la Organiza publicada:
//! todo lo de la web llega solo; aquí vive lo propio del Mac.
//! - Ícono arriba (barra de menú) con accesos y «Abrir al prender el Mac».
//! - ⌥+Espacio muestra / esconde la ventana desde cualquier parte.
//! - Cerrar la ventana NO cierra la app: queda corriendo de fondo, así los avisos, las alarmas y el
//!   focus que se abre solo siguen funcionando aunque Chrome esté cerrado. (Salir: menú del ícono o ⌘Q.)
//! - Comandos que llama la web: `notify` (aviso nativo), `focus_mode` (ventana al frente y siempre encima).
//! - Sin App Nap: macOS no adormece la app de fondo (si no, los relojes de la página se atrasan).
//! - Se actualiza sola: busca versiones nuevas en GitHub Releases al abrir y cada 6 h.
//! - 🎵 Canciones que YouTube no deja sonar dentro de la página (2026-11-17, 1.0.3): se abren en una
//!   ventana de YouTube ESCONDIDA (`yt_*`), solo se escuchan y el focus sigue en pantalla. La ventanita
//!   le cuenta a la página cada medio segundo dónde va (`yt_report` → evento «yt-state»).

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
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

const SAFARI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/// Solo ventanas «yt-…» (las de la música): la página nunca puede tocar otra ventana con estos comandos.
fn yt_window(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    if !label.starts_with("yt-") {
        return None;
    }
    app.get_webview_window(label)
}

/// Abre (escondida) la canción de YouTube `video` desde el segundo `start`, al volumen `volume` (0–100).
#[tauri::command]
fn yt_open(app: AppHandle, label: String, video: String, start: f64, volume: f64) -> Result<(), String> {
    if !label.starts_with("yt-") || !video.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("datos inválidos".into());
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    let url = format!("https://www.youtube.com/watch?v={}&t={}s", video, start.max(0.0).floor() as u64);
    let vol = (volume / 100.0).clamp(0.0, 1.0);
    // Cada medio segundo le cuenta a la página dónde va el video (y le pone el volumen que se pidió).
    let script = format!(
        r#"(function(){{
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;
  window.__mpVol = {vol};
  setInterval(function(){{
    var v = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!v) return;
    if (Math.abs(v.volume - window.__mpVol) > 0.01) v.volume = window.__mpVol;
    var ad = !!document.querySelector('.ad-showing');
    var st = v.ended ? 0 : v.paused ? 2 : (v.readyState < 3 || ad) ? 3 : 1;
    try {{ window.__TAURI__.core.invoke('yt_report', {{ label: '{label}', t: ad ? 0 : v.currentTime, dur: ad ? 0 : (v.duration || 0), state: st }}); }} catch (e) {{}}
  }}, 500);
}})();"#
    );
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url.parse().map_err(|_| "url")?))
        .title("Master Planner · música")
        .inner_size(360.0, 230.0)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .user_agent(SAFARI_UA)
        .initialization_script(script)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// La ventanita de música le cuenta a la página dónde va.
#[tauri::command]
fn yt_report(app: AppHandle, label: String, t: f64, dur: f64, state: i32) {
    let _ = app.emit_to("main", "yt-state", serde_json::json!({ "label": label, "t": t, "dur": dur, "state": state }));
}

/// play · pause · seek (valor = segundo) · volume (valor = 0–100).
#[tauri::command]
fn yt_cmd(app: AppHandle, label: String, action: String, value: f64) {
    let Some(w) = yt_window(&app, &label) else { return };
    let js = match action.as_str() {
        "play" => "var v=document.querySelector('video');v&&v.play();".to_string(),
        "pause" => "var v=document.querySelector('video');v&&v.pause();".to_string(),
        "seek" => format!("var v=document.querySelector('video');v&&(v.currentTime={});", value.max(0.0)),
        "volume" => format!("window.__mpVol={};", (value / 100.0).clamp(0.0, 1.0)),
        "mute" => format!("var v=document.querySelector('video');v&&(v.muted={});", value > 0.0),
        _ => return,
    };
    let _ = w.eval(&js);
}

/// Muestra la ventanita chica en una esquina (encima de todo) o la vuelve a esconder.
#[tauri::command]
fn yt_show(app: AppHandle, label: String, show: bool) {
    let Some(w) = yt_window(&app, &label) else { return };
    if show {
        if let Ok(Some(m)) = w.current_monitor() {
            let s = m.scale_factor();
            let size = m.size().to_logical::<f64>(s);
            let pos = m.position().to_logical::<f64>(s);
            let _ = w.set_position(tauri::LogicalPosition::new(pos.x + size.width - 380.0, pos.y + size.height - 270.0));
        }
        let _ = w.set_always_on_top(true);
        let _ = w.show();
    } else {
        let _ = w.hide();
    }
}

/// Cierra la ventanita de música.
#[tauri::command]
fn yt_close(app: AppHandle, label: String) {
    if let Some(w) = yt_window(&app, &label) {
        let _ = w.close();
    }
}

/// Busca una versión nueva de la app de Mac. `manual` = la pidió la persona (avisa también si no hay).
async fn check_update(app: AppHandle, manual: bool) {
    let Ok(updater) = app.updater() else { return };
    match updater.check().await {
        Ok(Some(update)) => {
            let ok = app
                .dialog()
                .message(format!("Hay una versión nueva de Master Planner para Mac ({}). ¿Actualizar ahora? Tarda unos segundos.", update.version))
                .title("Master Planner")
                .buttons(MessageDialogButtons::OkCancelCustom("Actualizar".into(), "Después".into()))
                .blocking_show();
            if ok && update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                app.restart();
            }
        }
        Ok(None) => {
            if manual {
                app.dialog().message("Ya tienes la última versión de Master Planner para Mac.").title("Master Planner").blocking_show();
            }
        }
        Err(e) => {
            if manual {
                app.dialog().message(format!("No se pudo buscar actualizaciones: {e}")).title("Master Planner").blocking_show();
            }
        }
    }
}

/// Que macOS no adormezca la app cuando está de fondo (App Nap): los avisos y el focus dependen de sus relojes.
#[cfg(target_os = "macos")]
fn keep_awake() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    let info = NSProcessInfo::processInfo();
    let reason = NSString::from_str("Master Planner: avisos, alarmas y focus a su hora");
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
        // Si la página principal se recarga, ninguna ventanita de música queda sonando sola.
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                for (label, w) in webview.app_handle().webview_windows() {
                    if label.starts_with("yt-") {
                        let _ = w.close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![notify, focus_mode, bring_to_front, yt_open, yt_report, yt_cmd, yt_show, yt_close])
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
            let open = MenuItem::with_id(app, "abrir", "Abrir Master Planner   ⌥ Espacio", true, None::<&str>)?;
            let hoy = MenuItem::with_id(app, "inicio", "Hoy", true, None::<&str>)?;
            let horario = MenuItem::with_id(app, "horario", "Horario", true, None::<&str>)?;
            let daily = MenuItem::with_id(app, "daily", "Daily", true, None::<&str>)?;
            let cal = MenuItem::with_id(app, "calendario", "Calendario", true, None::<&str>)?;
            let login = CheckMenuItem::with_id(app, "login", "Abrir al prender el Mac", true, on_login, None::<&str>)?;
            let upd = MenuItem::with_id(app, "update", "Buscar actualizaciones…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "salir", "Salir de Master Planner", true, None::<&str>)?;
            let sep = || PredefinedMenuItem::separator(app);
            let menu = Menu::with_items(app, &[&open, &sep()?, &hoy, &horario, &daily, &cal, &sep()?, &login, &upd, &sep()?, &quit])?;
            let login_item = login.clone();
            TrayIconBuilder::with_id("organiza")
                .icon(app.default_window_icon().cloned().expect("ícono"))
                .icon_as_template(false)
                .tooltip("Master Planner")
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
                // La ventanita de música sí se cierra de verdad.
                if window.label().starts_with("yt-") {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("no se pudo abrir Master Planner");

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
