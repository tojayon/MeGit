#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_window;

use std::{
    fs,
    io::{BufRead, BufReader},
    os::windows::process::CommandExt,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    webview::NewWindowResponse, AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const PORT: u16 = 43217;
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Copy)]
enum Failure {
    Start,
    PortBusy,
    BackendStopped,
}

impl Failure {
    fn message(self, chinese: bool) -> String {
        match (self, chinese) {
            (Self::Start, true) => "无法启动 MeGit。请检查安装是否完整以及 WebView2 是否已安装。".into(),
            (Self::Start, false) => "MeGit could not start. Check the installation and the WebView2 Runtime.".into(),
            (Self::PortBusy, true) => format!("本机端口 {PORT} 已被占用。请关闭占用端口的程序后重试。MeGit 不会关闭该程序。"),
            (Self::PortBusy, false) => format!("Local port {PORT} is in use. Close the program using it and try again. MeGit does not stop that program."),
            (Self::BackendStopped, true) => "MeGit 的本地服务意外退出。请重新启动 MeGit。".into(),
            (Self::BackendStopped, false) => "MeGit's local backend stopped unexpectedly. Restart MeGit.".into(),
        }
    }
}

struct Backend(Child);

impl Backend {
    fn start(resources: &Path, data: &Path) -> Result<Self, Failure> {
        fs::create_dir_all(data).map_err(|_| Failure::Start)?;
        let mut backend = Self(
            Command::new(resources.join("node.exe"))
                .args(["dist-server/server/index.js", "--production", "--desktop"])
                .current_dir(resources)
                .env("MEGIT_DATA_DIR", data)
                .env("MEGIT_PORT", PORT.to_string())
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|_| Failure::Start)?,
        );
        let stdout = backend.0.stdout.take().ok_or(Failure::Start)?;
        let (send, receive) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let mut lines = BufReader::new(stdout).lines();
            if let Some(Ok(line)) = lines.next() {
                let _ = send.send(line);
            }
            drop(send);
            for line in lines {
                if line.is_err() {
                    break;
                }
            }
        });
        match receive.recv_timeout(Duration::from_secs(15)).as_deref() {
            Ok("READY") => Ok(backend),
            Ok("PORT_BUSY") => Err(Failure::PortBusy),
            _ => Err(Failure::Start),
        }
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        drop(self.0.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(12);
        loop {
            match self.0.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
                _ => break,
            }
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

type Service = Mutex<Option<Backend>>;

fn same_origin(url: &Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(PORT)
        && url.username().is_empty()
        && url.password().is_none()
}

fn open_in_browser(url: &Url) {
    if matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
    {
        let _ = open::that_detached(url.as_str());
    }
}

fn show_failure(app: &AppHandle, failure: Failure) {
    let chinese = sys_locale::get_locale().is_some_and(|locale| locale.starts_with("zh"));
    let handle = app.clone();
    app.dialog()
        .message(failure.message(chinese))
        .title("MeGit")
        .kind(MessageDialogKind::Error)
        .show(move |_| handle.exit(1));
}

fn start_window(app: &AppHandle) -> Result<(), Failure> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| Failure::Start)?
        .join("backend");
    let data = app
        .path()
        .app_local_data_dir()
        .map_err(|_| Failure::Start)?
        .join("data");
    let backend = Backend::start(&resources, &data)?;
    let settings = desktop_window::initialize(app, data.parent().ok_or(Failure::Start)?);
    let url = format!("http://127.0.0.1:{PORT}/")
        .parse()
        .map_err(|_| Failure::Start)?;
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("MeGit")
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 480.0)
        .decorations(settings.system_title_bar)
        .initialization_script(include_str!("window_bridge.js"))
        .on_navigation(|url| {
            if same_origin(url) {
                return true;
            }
            open_in_browser(url);
            false
        })
        .on_new_window(|url, _| {
            open_in_browser(&url);
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|_| Failure::Start)?;
    app.manage(Service::new(Some(backend)));
    let monitor = app.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let state = monitor.state::<Service>();
        let mut backend = state.lock().expect("backend lock");
        let Some(child) = backend.as_mut() else {
            return;
        };
        if !matches!(child.0.try_wait(), Ok(None)) {
            let _ = backend.take();
            drop(backend);
            let handle = monitor.clone();
            let _ = monitor.run_on_main_thread(move || {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.hide();
                }
                show_failure(&handle, Failure::BackendStopped);
            });
            return;
        }
    });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop_window::show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![desktop_window::desktop_window])
        .on_window_event(desktop_window::on_window_event)
        .setup(|app| {
            if let Err(failure) = start_window(app.handle()) {
                show_failure(app.handle(), failure);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("MeGit desktop initialization failed")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                if let Some(service) = app.try_state::<Service>() {
                    let _ = service.lock().expect("backend lock").take();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricts_window_navigation_to_the_owned_http_origin() {
        assert!(same_origin(
            &format!("http://127.0.0.1:{PORT}/design-system")
                .parse()
                .unwrap()
        ));
        for url in [
            "http://localhost:43217/",
            "http://127.0.0.1:4317/",
            "https://127.0.0.1:43217/",
            "http://name@127.0.0.1:43217/",
            "https://example.com/",
        ] {
            assert!(!same_origin(&url.parse().unwrap()));
        }
    }
}
