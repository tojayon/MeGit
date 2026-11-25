<p align="center"><img src="public/brand/megit-logo.svg" width="250" alt="MeGit"></p>

<h1 align="center">面向多仓库工作流的可视化 Git 工作台</h1>

<p align="center">把相关仓库放在同一张白板上，查清每条分支还缺哪些提交，并逐步审阅发布所需的 Git 改动。</p>

<p align="center"><a href="#快速开始">快速开始</a> · <a href="#产品导览">产品导览</a> · <a href="#典型场景">典型场景</a> · <a href="https://github.com/tojayon/MeGit/releases">下载安装</a> · <a href="README.md">English</a></p>

![MeGit 明亮主题。组件库向 Web 应用整合四个待合入提交，发布检查带有重试回路](docs/screenshots/workflow.zh-CN.png)

## MeGit 能做什么

MeGit 适合代码和发布步骤分布在多个 Git 仓库里的项目。仓库卡片展示分支和工作区状态，有向连线标明改动要去哪里。点开卡片可以查看 Git 历史，点开代码整合连线可以核对目标还缺哪些提交。

- **看全局。** 用分组整理仓库，把同一仓库的不同引用并排放在画布上，再画出构建、测试和发布的判断步骤。多个工作流可按标签切换，可见画布可导出为 SVG 或 PNG。
- **追到文件。** 从分支地图了解分叉和合流，查看提交差异，再把所需改动从工作区暂存并提交。
- **先审阅再应用。** 拉取和推送前核对方向，合并前后查看差异，修改 npm 版本或采用 AI 建议前先看具体变更。

## 快速开始

### Windows 桌面版

从 [GitHub Releases](https://github.com/tojayon/MeGit/releases) 下载 Windows x64 安装包及对应的 `SHA256.txt`。预发布安装包未签名。MeGit 内置 Node.js，Git 操作使用系统安装的 Git for Windows。[安装与校验说明](desktop/README.zh-CN.md)。

### 浏览器版

安装 Node.js **22.12 或更新版本**，并确保 Git 已加入 `PATH`。

```sh
git clone https://github.com/tojayon/MeGit.git
cd MeGit
npm ci
npm run build
npm start
```

打开 [http://127.0.0.1:4317](http://127.0.0.1:4317)。Windows 也可以双击 [`Start-MeGit.cmd`](Start-MeGit.cmd)，首次运行会安装依赖并构建。

### 建立第一个工作流

1. 点「添加仓库」，登记两个已有的本机 Git 仓库。要比较同一仓库的两个引用，也可以再添加一张卡片，并绑定到另一条分支。
2. 从来源卡片连到目标卡片，选择「代码整合」。用于比较的两个引用需要有共同的提交历史。
3. 点开连线查看结果。若目标缺少比较用的 Git 对象，可在目标仓库获取来源远端，再回来核对。

## 产品导览

### 1. 把仓库和发布步骤放在同一张白板上

仓库卡片可以和说明、判断节点及重试回路放在同一张画布中。「代码整合」读取 Git 历史，「开发依赖」和「交付」记录你定义的先后关系。相关仓库可分组，各项目或发布流程可分别使用工作流标签。

<details>
<summary>查看同一发布白板的暗黑主题</summary>

![暗黑主题下的发布工作流白板](docs/screenshots/workflow-dark.zh-CN.png)

</details>

### 2. 查清哪些提交已经合入

整合比较按提交祖先关系核对来源和目标引用，展示共同历史以及目标还缺的提交。两个本机仓库之间，可以开启快进整合，也可以先准备合并、审阅暂存结果，再确认提交或中止。交付连线用于标记预期交接，实际构建和部署状态以发布流程的结果为准。

![整合比较显示来源、目标和四个待整合提交](docs/screenshots/integration.zh-CN.png)

### 3. 从分支地图追到单次提交

分支地图呈现 Git 历史中的真实分叉与合流。「更换比较树干」可以切换观察基准，当前检出的分支保持原位。点选分支可查看状态，也可以直接和树干比较，或打开最新提交的文件差异。连续提交折叠后，仍可在原处展开局部历史。

<p align="center">
  <a href="docs/screenshots/branch-map.zh-CN.png"><img src="docs/screenshots/branch-map.zh-CN.png" width="46%" alt="分支地图展示功能分支、合流和 HEAD"></a>
  <a href="docs/screenshots/branch-comparison.zh-CN.png"><img src="docs/screenshots/branch-comparison.zh-CN.png" width="46%" alt="图上比较展示 feature/export 独有的提交"></a>
</p>

<details>
<summary>查看提交差异和暗黑分支地图</summary>

![提交差异显示受影响的文件和新增的导出函数](docs/screenshots/commit-diff.zh-CN.png)

![暗黑主题下的分支地图](docs/screenshots/branch-map-dark.zh-CN.png)

</details>

### 4. 审阅工作区，确认后提交和同步

工作区并排显示未暂存和已暂存的文件。可以查看文件差异、逐个或批量暂存和取消暂存，再填写提交说明。白板卡片共用提交草稿，也提供暂存和提交入口。「获取」更新本机的远端引用，「拉取」和「推送」会显示同步方向并请求确认。

![工作区并排显示未暂存与已暂存文件，并提供同步和提交操作](docs/screenshots/working-tree.zh-CN.png)

<details>
<summary>查看提交说明编辑器和暗黑工作区</summary>

![展开提交说明编辑器，填写标题和发布检查步骤](docs/screenshots/commit-message.zh-CN.png)

![暗黑主题下的工作区](docs/screenshots/working-tree-dark.zh-CN.png)

</details>

### 5. 编辑项目文件，预览版本升级

从仓库工具栏打开「仓库文件」，在左侧选择文件，在右侧查看、编辑和预览差异。支持不超过 96 KiB、未被忽略的现有 UTF-8 文本文件。点击仓库卡片的「已修改」或「已暂存」即可打开工作区面板，使用已配置的快捷字段。npm 版本快捷字段会同步修改 `package.json` 与已有 npm 锁文件。JSON 快捷字段可修改 `/release/channel` 这样的单值字段并保留周围格式。

![版本快捷字段预览 package.json 和 package-lock.json 的版本变化](docs/screenshots/version-preview.zh-CN.png)

<details>
<summary>查看仓库文件树和保存前的差异</summary>

![仓库文件树和并排显示的发布检查清单编辑区](docs/screenshots/repository-file-tree.zh-CN.png)

![仓库文件预览显示 README.md 发布检查清单的修改](docs/screenshots/repository-files.zh-CN.png)

</details>

### 6. 让 AI 助手根据所选仓库给出建议

引用需要讨论的仓库，助手可以总结状态、起草提交说明、提出白板改动，或准备暂存、提交及推送到已配置上游的 Git 计划。你可以先审阅再确认。需要 AI 编辑项目文件时，可单独授权一个仓库。

![AI 助手引用两个仓库，回答发布前还有哪些工作](docs/screenshots/ai-assistant.zh-CN.png)

<details>
<summary>查看暗黑主题下的 AI 助手</summary>

![同一 AI 助手会话的暗黑界面](docs/screenshots/ai-assistant-dark.zh-CN.png)

</details>

### 7. 在 Windows 运行本地预览

审核并授权仓库已有的 npm 或 PowerShell 启动入口后，可从 MeGit 启动、重启或停止服务，查看终端日志，并打开运行中的本机地址。正在运行的服务可从工作流底栏直接访问。[本地服务脚本与示例](docs/LOCAL_SERVICE_SCRIPTS.zh-CN.md)。

![本地服务终端展示 npm 输出、预览端口和停止按钮](docs/screenshots/local-service.zh-CN.png)

<details>
<summary>查看暗黑主题下的本地服务终端</summary>

![暗黑主题下的本地服务终端](docs/screenshots/local-service-dark.zh-CN.png)

</details>

### 8. 用图解学习 Git，按习惯调整界面

「Git 图解课堂」用动画逐步演示暂存、快照、分支切换、合并、远端同步、撤销恢复和冲突处理。「偏好设置」可分别切换简体中文或英文、明亮或暗黑主题。

![Git 图解课堂逐步演示两个分支如何合流](docs/screenshots/git-classroom.zh-CN.png)

<details>
<summary>查看主题和语言偏好</summary>

![偏好设置包含暗黑、明亮和界面语言选择器](docs/screenshots/preferences.zh-CN.png)

</details>

## 典型场景

- **把共享组件库的更新同步给下游应用。** 从组件库向各应用连线，逐个核对哪些应用还缺相关提交。
- **维护公开版与内部版。** 把两个仓库放在同一工作流，比较公共基线与内部分支所指向的提交。
- **准备一次发布。** 审阅工作区、预览 npm 版本改动，在 Windows 启动本地服务，再用判断节点记录发布检查的路径。
- **熟悉 Git 操作。** 在课堂中练习合并，再用分支地图、差异和命令提示理解真实仓库中的历史。

## 本地数据与 AI

MeGit 监听 `127.0.0.1`，工作流保存在本机。源码方式启动时，默认数据目录为 `.megit/`。Git 使用已有配置和凭据，获取、拉取和推送会连接操作所涉及的远端。

AI 功能可选。使用时，MeGit 会把当前功能选定的上下文发送给已配置的服务商，范围可能包括仓库信息、工作流文字、文件内容或差异。单次允许发送拟提交差异时，范围可能包含未暂存改动和新文件。发送私有代码前请核对范围。Windows 下保存的 API 密钥由当前用户的系统凭据保护。

## 使用文档与开发

- [中文使用指南](docs/USER_GUIDE.zh-CN.md) · [Windows 桌面版说明](desktop/README.zh-CN.md) · [本地服务脚本规范](docs/LOCAL_SERVICE_SCRIPTS.zh-CN.md)
- [项目架构](docs/ARCHITECTURE.md) · [产品设计规范](docs/DESIGN_SYSTEM.md) · [截图目录与复现说明](docs/screenshots/README.md)

运行 `npm run dev` 启动开发服务，`npm run check` 执行项目检查，`npm run test:e2e` 运行 Edge 场景。测试使用独立数据目录和临时仓库。

## 开源协议

MeGit 使用 [MIT 协议](LICENSE)。随项目分发的第三方组件保留各自的许可条款。
