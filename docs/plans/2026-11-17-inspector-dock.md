# 多详情区域 Implementation Plan

> **For Codex:** Use the approved horizontal layout in this session and implement each task with regression verification. Preserve user data and existing changes; do not commit or push.

**Goal:** 将右侧单一检查器改为可调宽的多详情区域，最大占窗口 2/3，详情横向并排且保留各自浏览状态。

**Architecture:** 画布选择与已打开详情分离。当前白板内以类型和 id 标识详情并去重，删除对象时清理对应详情；顶部标签用于定位和关闭，内容保持挂载并独立纵向滚动，区域内支持横向滚动。宽度放在浏览器偏好中，以窗口 2/3 为硬上限；拖拽与键盘直接调节，标签定位平滑滚动并尊重减少动态效果。

**Tech Stack:** React、TypeScript、原生 Pointer Events／scroll API、既有基础组件、i18next、CSS tokens、Vitest、Playwright／Edge。

## Task 1：状态与边界

- 新建 `src/lib/inspector-dock.ts` 和 `tests/inspector-dock.test.ts`。先验证打开去重、单独关闭后的相邻选择、当前白板作用域与删除清理，以及窗口变小后的宽度约束，再实现纯函数。
- 扩展 `src/preferences/storage.ts` 与测试：兼容旧偏好，保存有效宽度；偏好不写白板、不进入撤销历史。

## Task 2：详情区域与原有检查器接入

- 新建 `src/components/InspectorDock.tsx`：左边界拖拽与键盘分隔条、标签定位及关闭、前后滚动与关闭整个区域、独立详情容器。每列最小 320px，空间充裕时平分；区域窄于单列时允许在内部滚动。
- 修改 `src/App.tsx`：保持选择用于画布强调，打开详情不替换已有项；仓库、关系、分组、说明和白板详情全部接入。空白取消选择和白板历史回放保留详情，删除对象及时清理；切换白板关闭旧白板的详情。仓库操作状态与草稿保持各自组件实例，Git 保护不变。
- 修改 `src/styles.css`、`src/tokens.css` 和双语资源；复用 Button／IconButton／Tooltip，覆盖两主题、长标签、窄屏与触控，避免调整区域时改变画布视角。

## Task 3：浏览器验收与正式应用

- 新建 `e2e/inspector-dock.spec.ts`，先对旧构建确认多个详情与拖拽入口缺失，再验证同时浏览、状态保留、重复打开、单独关闭／删除清理、宽度拖拽／键盘／2/3 上限／恢复、内部横向滚动、两主题双语与窄屏。
- 按新多详情语义调整既有场景的面板定位，保留原业务断言。运行 `npm run check` 与完整独立数据 Edge 场景；只读复审并修重要问题。
- 更新架构、设计规范、使用说明和验收记录。核实正式服务并备份最新白板后更新，只读核验且不修改真实仓库。

## 状态

- 用户已确认横向并排方案，直接实施。
- 工程尚无提交，使用 `.megit/verification/inspector-dock/before/` 保存基线，保留其他会话与用户改动。
- 状态：已完成并应用到 `http://127.0.0.1:4317`。已通过 `npm run check`（80 项单元／接口测试）与完整 53 项 Edge 回归，正式只读核验确认多详情与 2/3 宽度上限生效，重启及浏览前后工作区哈希一致。
- 为避免并行开发改写构建，已验收的发布副本位于 `.worktrees/inspector-dock-release-20261117-0737/`；当前服务从该目录运行，后续正式更新前保留。主目录继续保留全部实现和其他会话改动，不自动提交或推送。
