fn main() {
    // Comandos propios con permiso por ventana: la ventanita de YouTube solo puede usar `yt_report`.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "notify",
        "focus_mode",
        "bring_to_front",
        "yt_open",
        "yt_report",
        "yt_cmd",
        "yt_show",
        "yt_close",
    ])))
    .expect("no se pudo preparar la app");
}
