# MeGit Windows 桌面版

[English](README.md)

## 安装与启动

运行 Windows x64 安装包 `MeGit_<版本>_x64-setup.exe`，然后从开始菜单打开 **MeGit**。安装以当前用户为范围。需要 WebView2；如果未安装，安装程序会联网获取。重新打开 MeGit 会唤醒已有窗口。默认关闭窗口时退出，并停止 MeGit 后端和它管理的本地服务。

- Git 功能使用系统安装的 **Git for Windows**；如果未找到 Git，请安装并加入 PATH 后重新打开 MeGit。GitHub 登录仍使用 Git Credential Manager 和默认浏览器。
- MeGit 内置自己的 Node.js。要启动仓库的 npm 脚本，仍需在系统 PATH 中安装该仓库需要的 Node.js，且配有同一安装内的 npm。PowerShell 脚本沿用本机 Windows PowerShell 和执行策略。
- 桌面版使用 `127.0.0.1:43217`。如果端口已经被占用，MeGit 提示后退出，不接管或停止其他程序。浏览器版默认仍使用 `4317`。

## 窗口与托盘

在 **软件设置 → 界面** 中更改，立即生效并在下次启动时恢复：

- **显示系统标题栏**（默认开启）：关闭后，中间面板的工作流标签栏兼作标题栏。拖动标签右侧空白可移动窗口，最右侧是最小化、最大化／还原和关闭窗口按钮。
- **关闭窗口时隐藏到系统托盘**（默认关闭）：启用后点击关闭按钮只隐藏窗口，MeGit 和它管理的本地服务继续运行。单击托盘图标或再次启动 MeGit 可恢复窗口；要停止服务并退出，请右击托盘图标并选择 **退出 MeGit**。

## 升级与迁移

请先退出 MeGit 再运行新版安装包。白板及服务设置位于 `%LOCALAPPDATA%/app.megit.desktop/data/`，窗口设置在同一应用本地目录的 `window-settings.json`，都不在安装目录内。卸载时如出现删除应用数据的选项，保留数据请勿勾选。无需迁移或复制登记的 Git 仓库。

从浏览器版迁移白板：退出两版，备份原数据及桌面版已有数据，然后将原数据目录（默认项目内 `.megit/`）的 `workspace.json` 复制到桌面数据目录。**桌面已有白板时不要直接覆盖**：当前没有自动合并。浏览器的语言、主题和标签页状态不会一同迁移。网络代理、AI 凭据和本地服务配置建议在桌面版重新设置并确认。

## 从源码构建

构建机器需有 Windows、Node.js 22.12+、Rust 的 x64 MSVC 工具链及 Visual Studio C++ 构建工具 / Windows SDK。用户电脑不需要这些构建工具。

在仓库根目录运行：

```powershell
npm ci
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1
```

安装包在 `desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`。正常构建不会自动签名或发布。对外分发前请配置发布者签名，并在干净的 Windows 环境验收安装、覆盖升级、卸载保留、外链、复制和导出。内置 Node 版本及其官方 ZIP 的固定 SHA-256 在 `build.ps1` 中一起维护。

仅准备资源：给构建脚本加 `-PrepareOnly`。随后运行 `node --test desktop/backend.test.mjs` 验证打包的后端；运行 `cargo test --locked --release --target x86_64-pc-windows-msvc --manifest-path desktop/src-tauri/Cargo.toml` 验证窗口导航规则。网页版构建与测试仍可独立运行。

## 在 GitHub 手动发版

1. 新版本先在根目录运行 `npm version 0.1.1 --no-git-tag-version`（将示例换成目标版本），提交并推送版本文件和本次改动到 `main`。首次发版也可以用项目中尚未发布的当前版本。无需提前创建标签。
2. 将发布工作流合入 GitHub 默认分支后，在仓库进入 **Actions → Windows Release → Run workflow**，选择 `main`，在 `version` 填入同一个版本号（不带 `v`），按需保留默认勾选的 `prerelease`。
3. 工作流测试并打包，保存安装包和 `SHA256.txt`，将 `v<版本>` 标签指向触发时的提交，并创建 **Release 草稿**。在运行摘要或 **Releases** 打开草稿，下载试装、审阅说明，再手动点击 **Publish release**。普通推送不会触发，也不会自动公开发布。当前自动构建不签名。

版本不匹配、同版本已有 Release（包括草稿），或同名标签指向其他提交时，工作流会失败，不会覆盖。如果上传中断并留下不完整的草稿，用该次运行的 **Artifacts** 补齐附件；如需重跑，请先清理不完整的草稿。标签已指向同一提交时可复用。若创建草稿报权限错误，请检查仓库或组织是否允许 Actions 创建标签和 Release。

推送修复后，请用 **Run workflow** 发起一次新的运行。旧失败记录里的 **Re-run jobs** 仍使用原来的提交，不会用上修复。
