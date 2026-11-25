# README screenshots

[English product tour](../../README.md#product-tour) · [中文产品导览](../../README.zh-CN.md#产品导览)

Each language has 19 screenshots, with 14 light-theme views and 5 dark-theme views. The captures show the app running in Microsoft Edge against temporary Git repositories. Scripted responses supply the example AI conversation and local service output.

中文和英文各 19 张，分别包含 14 张明亮主题与 5 张暗黑主题。Git 历史与文件差异来自临时演示仓库，AI 对话和本地服务输出使用预设数据。

## Screens / 场景

- Workflow canvas and integration comparison / 工作流白板与整合比较
- Branch map, in-map comparison, and commit diff / 分支地图、图上比较与提交差异
- Working tree and expanded commit message editor / 工作区与多行提交说明
- Repository file edit and npm version preview / 仓库文件编辑与 npm 版本预览
- AI assistant and Windows local service console / AI 助手与 Windows 本地服务终端
- Git visual classroom and preferences / Git 图解课堂与偏好设置

## Capture / 复现

To regenerate from the repository root in PowerShell:

```powershell
$env:MEGIT_CAPTURE_README = '1'
$env:MEGIT_E2E_PORT = '49473'
$env:MEGIT_E2E_DATA_DIR = '.megit/readme-showcase-state'
$env:MEGIT_E2E_OUTPUT = '.megit/readme-showcase-results'
npm run test:e2e -- e2e/readme-showcase.spec.ts
```

Review the PNGs under each language in `.megit/readme-capture/`. Copy the `en` files here with their existing names and append `.zh-CN` before `.png` for the `zh-CN` files. For example, `zh-CN/workflow.png` becomes `workflow.zh-CN.png`. The command above uses a separate port and workspace data directory.
