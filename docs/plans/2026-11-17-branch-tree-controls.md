# 分支地图工具与局部缩放 Implementation Plan

> 按用户本轮明确要求在当前会话实施。保留主目录全部已有改动，不提交或推送；无初始 Git 提交，发布采用 `.worktrees/` 下冻结源码副本。

**Goal:** 移除树干导航行，将工具集中到地图右上角；树干按需切换，分支详情更清楚，滚轮和双指缩放只影响地图。

**Architecture:** `BranchTree` 提供右上角工具插槽，`BranchTreePanel` 继续管理业务动作；共用按需 Dialog 选择比较树干。原生非被动 wheel 监听仅挂在图形视口，按鼠标位置保持缩放锚点，水平／Shift 滚动保留原生浏览。比较树干只改变读取视角，所有 Git 写入继续复用现有确认和服务校验。

**Tech Stack:** React、TypeScript、本地 SVG、语义 CSS token、i18next、Playwright／Edge。

## 1. 行为复现

- 在 `e2e/branch-tree-controls.spec.ts` 增加右上角工具、菜单内更换树干、滚轮／双指局部缩放及锚点验收，先运行确认旧界面失败。
- 使用独立数据目录和虚构仓库；记录缩放前后网页尺寸、白板视角与工作区 revision。

## 2. 工具与详情

- 修改 `src/components/BranchTree.tsx`、`BranchTreePanel.tsx` 和 `branch-tree.css`，移除常驻选择框行，合并右上角控件；空态仍可使用工作区及工具。
- 新增 `BranchTrunkDialog.tsx`：选择后明确应用，取消不改变视角，说明更换树干不切换当前代码。
- 点选详情使用图标、分支名称、HEAD／树干标记和分区动作建立层级，原始资料仍收在「i」。错误、冲突、占用及同步限制保持可见。
- 同步双语资源、非颜色 token 与 `/design-system` 真实地图工具及树干选择示例。

## 3. 手势

- 仅在 `.branch-tree-viewport` 通过 `{ passive: false }` 接管垂直滚轮和 Ctrl+wheel 双指缩放，阻止浏览器默认缩放。
- 连续事件使用同步比例引用，渲染后应用限幅的滚动位置，围绕鼠标锚点缩放；缩放不触发自动回树干／已选节点。
- 保留水平、Shift 滚动及键盘／按钮操作；地图外的详情、工具和网页行为不改变。

## 4. 验收与发布

- 更新旧测试的树干入口；运行专项与相关回归、`npm run check`、完整 `npm run test:e2e`。
- 核对暗黑中文、明亮英文、390px 触控、长名称和键盘焦点，并保存截图。
- 同步 README、架构、设计、主题及验证记录。冻结已验收源码正常构建，仅重启核实身份后的 MeGit 实例，核对正式资源及白板 SHA256。
- 证据保存于 `.megit/verification/branch-tree-controls/`。

## 实施记录

- 已完成地图工具整合、树干按需选择、分支卡片层级、详细帮助与双语示例。
- 已复现并修正双指默认网页缩放、同批反向缩放漏提交、矮窗口菜单裁切、直接／搜索选择焦点竞态及首次读取工具重挂载。地图比例范围 50%–200%，保留水平／Shift 滚动。
- 相关 34 项 Edge 场景全部通过；最终工程与完整回归日志分别位于证据目录 `check.log`、`e2e-full.log`。冻结发布及正式只读核验见 `deployment.json`、`live-check.json`。
