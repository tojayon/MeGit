# MeGit Desktop for Windows

[简体中文](README.zh-CN.md)

## Install and run

Run the Windows x64 installer, `MeGit_<version>_x64-setup.exe`, then open **MeGit** from the Start menu. Installation is per user. If WebView2 is missing, the installer downloads it. Starting MeGit again opens the existing window. By default, closing the window quits MeGit and stops its backend and managed local services.

Download the installer and `SHA256.txt` from the same [GitHub Release](https://github.com/tojayon/MeGit/releases). Run `Get-FileHash -Algorithm SHA256 -LiteralPath '.\MeGit_<version>_x64-setup.exe'` in PowerShell with the actual filename and compare the full hash with `SHA256.txt` before running the installer. Current preview builds are unsigned, so Windows may show a SmartScreen warning.

- Install **Git for Windows** and put it on your PATH for Git features. GitHub sign-in continues to use Git Credential Manager and your default browser.
- MeGit bundles its own Node.js. Running a repository npm script still requires the project's Node.js installation and its matching npm on your PATH. PowerShell scripts use Windows PowerShell and respect its execution policy.
- Desktop uses `127.0.0.1:43217`; it fails on a conflict without stopping or attaching to the other process. Browser mode still defaults to `4317`.

## Window and tray

Changes in **Settings → Interface** apply immediately and persist across restarts:

- **Show system title bar** is on by default. Turn it off to use the workflow tab bar as the title bar. Drag the space to the right of the tabs to move the window; minimize, maximize/restore, and close are at the far right.
- **Hide to the system tray on close** is off by default. When enabled, closing hides the window and keeps MeGit and its managed local services running. Click the tray icon or start MeGit again to bring back the window. To stop the services and quit, right-click the tray icon and choose **Quit MeGit**.

## Upgrade and migrate

Quit MeGit before running a new installer. Boards and service settings live in `%LOCALAPPDATA%/app.megit.desktop/data/`; window settings are in `window-settings.json` in the parent directory. Neither is in the installation directory. Leave any remove-app-data option unchecked when uninstalling if you want to keep your boards. Registered Git repositories do not need to move.

To migrate boards, quit both versions and back up both data directories. Copy `workspace.json` from the browser version's data directory (by default `.megit/` in the checkout) into the desktop data directory. Do not overwrite any existing desktop boards: there is no automatic merge. Browser language, theme and tab state are separate. Configure your proxy, AI credentials and local services again in the desktop app.

## Build from source

On Windows, install Node.js 22.12+, Rust's x64 MSVC toolchain, Visual Studio C++ Build Tools and the Windows SDK. End users do not need the build tools. From the repository root:

```powershell
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1
```

Find the installer in `desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. This build does not sign or publish it automatically. Sign releases and test installation, upgrade, data retention, links, clipboard and export on a clean Windows system before distribution. Maintain the bundled Node version and the pinned SHA-256 of its official ZIP together in `build.ps1`.

Add `-PrepareOnly` to stage the assets without generating an installer. Then use `node --test desktop/backend.test.mjs` to test the bundled backend and `cargo test --locked --release --target x86_64-pc-windows-msvc --manifest-path desktop/src-tauri/Cargo.toml` to test window navigation. Browser builds and tests remain independent.

## Build and release on GitHub

1. Run `npm version 0.1.3 --no-git-tag-version` at the repository root (replace the example with the intended version). Commit and push the version files and changes to `main`. The workflow compares the root `package.json` before and after the entire push and only tests and builds automatically if `version` changes. No tag is required in advance. Automatic builds mark the draft as a pre-release.
2. To build without changing the version, open **Actions → Windows Release → Run workflow**, select `main`, enter the current `version` without the `v` prefix, and choose whether to mark it as a `prerelease`. Adding the workflow alone does not backfill existing versions.
3. The workflow saves the installer with `SHA256.txt`, points the `v<version>` tag at the built commit, and creates a **Release draft**. Open the draft from the run summary or **Releases**, test the installer, review the notes, and click **Publish release** yourself. The automated build is unsigned and never publishes the draft.

The workflow refuses version mismatches, existing releases (including drafts), and tags that point at a different commit. If an interrupted upload leaves an incomplete draft, recover the files from the run's **Artifacts**, or remove the incomplete draft before retrying. A tag already pointing to the same commit can be reused. If draft creation fails with a permissions error, check whether repository or organization policy allows Actions to create tags and releases.

After pushing a fix, start a new run using **Run workflow**. **Re-run jobs** uses the original commit and will not pick up the fix.
