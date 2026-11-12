// Sin ventana de terminal en Windows (en Mac no aplica).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    organiza_lib::run()
}
