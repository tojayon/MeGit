use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WebviewWindow, Window, WindowEvent,
};

const TRAY: &str = "megit-tray";
const OPEN: &str = "megit-open";
const QUIT: &str = "megit-quit";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub system_title_bar: bool,
    close_to_tray: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            system_title_bar: true,
            close_to_tray: false,
        }
    }
}

impl Settings {
    fn load(path: &Path) -> Self {
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn save(self, path: &Path) -> io::Result<()> {
        let temp = path.with_extension("tmp");
        fs::write(&temp, serde_json::to_vec(&self)?)?;
        fs::rename(temp, path)
    }
}

#[derive(Clone, Copy, Deserialize)]
pub enum Language {
    #[serde(rename = "zh-CN")]
    Chinese,
    #[serde(rename = "en")]
    English,
}

impl Language {
    fn from_system() -> Self {
        if sys_locale::get_locale().is_some_and(|locale| locale.starts_with("zh")) {
            Self::Chinese
        } else {
            Self::English
        }
    }

    fn tray_menu(self, app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
        let (open, quit) = match self {
            Self::Chinese => ("打开 MeGit", "退出 MeGit"),
            Self::English => ("Open MeGit", "Quit MeGit"),
        };
        Menu::with_items(
            app,
            &[
                &MenuItem::with_id(app, OPEN, open, true, None::<&str>)?,
                &MenuItem::with_id(app, QUIT, quit, true, None::<&str>)?,
            ],
        )
    }
}

pub struct DesktopState {
    path: PathBuf,
    settings: Settings,
    language: Language,
}

pub fn initialize(app: &AppHandle, directory: &Path) -> Settings {
    let path = directory.join("window-settings.json");
    let mut settings = Settings::load(&path);
    let language = Language::from_system();
    if settings.close_to_tray && enable_tray(app, language).is_err() {
        settings.close_to_tray = false;
    }
    app.manage(Mutex::new(DesktopState {
        path,
        settings,
        language,
    }));
    settings
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn enable_tray(app: &AppHandle, language: Language) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY) {
        return tray.set_visible(true);
    }
    let icon = app
        .default_window_icon()
        .ok_or(tauri::Error::InvalidIcon(io::Error::new(
            io::ErrorKind::NotFound,
            "MeGit tray icon",
        )))?;
    TrayIconBuilder::with_id(TRAY)
        .icon(icon.clone())
        .tooltip("MeGit")
        .menu(&language.tray_menu(app)?)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => show_main(app),
            QUIT => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn disable_tray(app: &AppHandle) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY) {
        tray.set_visible(false)?;
    }
    Ok(())
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let close_to_tray = window
            .try_state::<Mutex<DesktopState>>()
            .and_then(|state| state.lock().ok().map(|state| state.settings.close_to_tray))
            .unwrap_or(false);
        if close_to_tray && window.hide().is_ok() {
            api.prevent_close();
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    Read,
    SetSystemTitleBar { enabled: bool },
    SetCloseToTray { enabled: bool },
    SetLanguage { language: Language },
    Drag,
    Minimize,
    ToggleMaximize,
    Close,
}

fn permits(label: &str, url: &tauri::Url) -> bool {
    label == "main" && super::same_origin(url)
}

#[tauri::command]
pub fn desktop_window(
    window: WebviewWindow,
    state: State<'_, Mutex<DesktopState>>,
    request: Request,
) -> Result<Settings, &'static str> {
    const FAILED: &str = "windowOperationFailed";
    if !window.url().is_ok_and(|url| permits(window.label(), &url)) {
        return Err(FAILED);
    }

    let app = window.app_handle();
    let mut state = state.lock().map_err(|_| FAILED)?;
    let current = state.settings;
    let mut next = current;
    match request {
        Request::SetSystemTitleBar { enabled } if enabled != current.system_title_bar => {
            next.system_title_bar = enabled;
            window.set_decorations(enabled).map_err(|_| FAILED)?;
            if next.save(&state.path).is_err() {
                let _ = window.set_decorations(current.system_title_bar);
                return Err(FAILED);
            }
        }
        Request::SetCloseToTray { enabled } if enabled != current.close_to_tray => {
            let apply = |enabled| {
                if enabled {
                    enable_tray(app, state.language)
                } else {
                    disable_tray(app)
                }
            };
            next.close_to_tray = enabled;
            apply(enabled).map_err(|_| FAILED)?;
            if next.save(&state.path).is_err() {
                let _ = apply(current.close_to_tray);
                return Err(FAILED);
            }
        }
        Request::SetLanguage { language } => {
            if let Some(tray) = app.tray_by_id(TRAY) {
                let menu = language.tray_menu(app).map_err(|_| FAILED)?;
                tray.set_menu(Some(menu)).map_err(|_| FAILED)?;
            }
            state.language = language;
        }
        Request::Drag => window.start_dragging().map_err(|_| FAILED)?,
        Request::Minimize => window.minimize().map_err(|_| FAILED)?,
        Request::ToggleMaximize => {
            if window.is_maximized().map_err(|_| FAILED)? {
                window.unmaximize().map_err(|_| FAILED)?;
            } else {
                window.maximize().map_err(|_| FAILED)?;
            }
        }
        Request::Close => {
            drop(state);
            window.close().map_err(|_| FAILED)?;
            return Ok(current);
        }
        _ => {}
    }
    state.settings = next;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_use_safe_defaults_and_round_trip_independently() {
        let directory =
            std::env::temp_dir().join(format!("megit-window-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("window-settings.json");
        assert!(Settings::load(&path).system_title_bar);
        assert!(!Settings::load(&path).close_to_tray);
        fs::write(&path, b"not settings").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
        let changed = Settings {
            system_title_bar: false,
            close_to_tray: true,
        };
        changed.save(&path).unwrap();
        assert_eq!(Settings::load(&path), changed);
        Settings::default().save(&path).unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn commands_are_typed_and_restricted_to_the_main_window_origin() {
        let owned = "http://127.0.0.1:43217/design-system".parse().unwrap();
        assert!(permits("main", &owned));
        assert!(!permits("external", &owned));
        assert!(!permits(
            "main",
            &"https://127.0.0.1:43217/".parse().unwrap()
        ));
        assert!(matches!(
            serde_json::from_str(r#"{"action":"setCloseToTray","enabled":true}"#),
            Ok(Request::SetCloseToTray { enabled: true })
        ));
        for invalid in [
            r#"{"action":"setCloseToTray","enabled":"true"}"#,
            r#"{"action":"setLanguage","language":"unknown"}"#,
            r#"{"action":"setSystemTitleBar","enabled":false,"path":"custom"}"#,
            r#"{"action":"quit"}"#,
        ] {
            assert!(serde_json::from_str::<Request>(invalid).is_err());
        }
    }
}
