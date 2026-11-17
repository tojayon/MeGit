# MeGit 设计规范落地 Implementation Plan

> **For Codex:** Use the approved design in this session, preserving current workspace changes and user data.

**Goal:** 将已确认的设计规范落实到共用尺寸、高频组件、字段错误、保存恢复和可运行样例，并登记白板交互约定。

**Architecture:** 颜色继续由 `src/themes.css` 和品牌色卡管理，非颜色规则放入共享 `src/tokens.css`。新增轻量 React 基础组件并逐步替换已有表单与检查器；`/design-system` 只展示真实组件和本地演示状态，不挂载工作区或读取仓库。保存失败重试继续使用原串行保存队列，冲突仍停止写入。

**Tech Stack:** React 19、TypeScript、i18next、CSS tokens、Vitest、Playwright / Edge。

**Status:** 五项任务均已完成。`npm run check`（74 项单元／接口）和完整 Edge（31 项）通过；视觉、正式资源与白板数据核验通过。具体证据见 `docs/VERIFICATION.md` 和 `.megit/verification/design-system/`。

## Task 1：先验证交互缺口

- 新增 `e2e/design-system.spec.ts`：字段错误与焦点、异步提交防重复、失败重试与冲突停止写入、真实组件示例的双主题双语与窄屏。
- 先对原构建运行字段错误与示例入口场景，确认因功能缺失失败。
- 本轮以 `.megit/verification/design-system/before/` 为源文件基线，项目尚无已提交基线，不新建空工作树；不提交、不推送。

## Task 2：共用规则与组件

- 新增 `src/tokens.css`；在 `src/main.tsx` 加载，标准检查识别共用变量。
- 新增 `Button`、`IconButton`、`Field`、`PanelHeader`，补齐加载、禁用、焦点、错误关联及长文本。
- 整理 `src/styles.css` 中基础按钮、表单、标题、导航与触控尺寸；保留画布几何、品牌资源与配色。
- 迁移 `Dialogs.tsx`、`GroupDialog.tsx`、四类检查器和仓库面板的高频控件，沿用已有 Tooltip。

## Task 3：反馈与恢复

- 添加仓库提交中锁定重复提交与关闭；路径失败关联字段，聚焦错误并在修改后清除过期提示。
- 关系引用与分组成员错误贴近字段，接入无障碍关联与错误焦点。
- `use-workspace.ts` 为可重试的传输失败提供人工重试；版本冲突不重试、不覆盖。主界面持续显示未保存反馈。
- Git 操作提示增加仓库对象；中英文同步，保持技术诊断脱敏。

## Task 4：真实示例与完整规范

- 新增 `/design-system`，复用实际基础组件与偏好设置，演示加载、禁用、长内容、字段错误、状态与空态。
- 在生成的色卡加入组件规范入口；完整设计规范统一登记骨架、尺寸、组件状态、列表／表单、反馈、白板交互与验收，不预建无需求的表格或日期组件。
- 更新 `AGENTS.md`、README、主题规范及界面原则，确保后续开发自动遵循。

## Task 5：验证与正式预览

- 运行 `npm run check` 和独立端口、独立数据目录的完整 `npm run test:e2e`；只对行为变化增加有意义测试。
- 核对暗黑／明亮、中英文、窄屏、键盘和长内容；截图与日志放 `.megit/verification/design-system/`。
- 更新使用说明和验证记录，构建后核实进程身份，仅重启绑定 127.0.0.1 的 MeGit。正式页面检查阻止所有数据写请求，核对资源和工作区哈希。

## 实施中确认的补充

- 完整回归复现打开检查器后连线拖动找不到端点的问题，定位到容器 `ResizeObserver` 在 100ms 后自动适应白板。新增手动视角回归先确认从 `translate(40px, 50px) scale(0.8)` 被改为其他视角，再去除容器尺寸变化引起的自动定位；保留初次显示、新增、主动聚焦和适应白板入口。
- 共享目录有另一对话开发分支管理，本轮保留其修改。验证脚本放在忽略目录中，完整回归使用临时目录中的固定构建副本，避免并行重建短暂移除 `dist/index.html` 干扰验证。
- 触屏截图发现 `.button.compact` 的旧选择器优先级覆盖 44px 规则。增加实际粗指针浏览器断言先确认最小高度只有 32.8px，再统一基础按钮与紧凑按钮的触控高度。
