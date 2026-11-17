# 分支生长树 Implementation Plan

> 按用户已确认的树形方案在当前会话连续完成。主目录尚无 Git 提交，保留全部暂存、未暂存文件和白板；不创建提交或推送。发布和验证的独立源码副本放在 .worktrees，证据放在 .megit/verification/branch-tree。

**Goal:** 仓库详情默认展示真实提交关系形成的向上分支树，支持更换比较树干、点选分支、图上比较和渐进操作，保留已有 Git 能力。

**Architecture:** 独立的只读分支树接口返回完整引用、上游、worktree 映射及有上限的真实提交图；按需比较使用固定 SHA。纯布局模块处理共享节点、首父主干、多父合流、边界和多个根。React 图形组件复用双主题、i18n、基础按钮与帮助；文件、历史和管理表单按需进入 Dialog。现有写操作继续经过相同的校验和队列。

**Tech Stack:** React、TypeScript、本地 SVG、i18next、Git 参数数组、Vitest、Playwright／Edge。

## 1. 数据和边界

- 新增 tests/branch-tree.test.ts：临时虚构仓库覆盖真实分叉、merge、同名标签、空仓库、detached、无共同历史、上游及工作目录；验证读取不改变 HEAD、index 和工作区。
- 先运行新增测试确认缺少能力，再实现 shared/types.ts、server/branch-tree.ts、server/app.ts 与 src/lib/api.ts。
- 图形读取有上限，缺失父节点显示历史边界；比较计数不从截断图猜测；引用严格匹配现有完整引用，过期 SHA 返回稳定错误。

## 2. 图形布局

- 新增 tests/branch-tree-layout.test.ts，先验证树干位于中心、父提交位于子提交下方、共享提交不重复、真实多父边、同点引用、不同根与截断边界。
- 实现 src/lib/branch-tree.ts。使用平滑曲线、足够标签空间和独立的树图滚动／缩放，不能触发白板适应。

## 3. 真实详情接入

- 新增 e2e/branch-tree.spec.ts，先确认现有默认文件界面失败。
- 新增 BranchTree 和所选分支渐进浮层；更新 RepositoryPanel 和 BranchesPanel，复用已有创建／切换／删除、暂存／提交、同步、差异和帮助。
- 不添加常驻次级标签栏；路径、完整 SHA 收在信息入口；当前／占用／冲突状态清楚，浏览和比较不切换分支。
- 新增双语资源、语义样式和尺寸 token，更新 /design-system 真实示例。保持仓库头像、课堂和现有多详情能力。

## 4. 回归和发布

- 调整旧场景的入口定位，保留原有行为验收，运行 npm run check 和完整 npm run test:e2e。
- 验证两主题、中英文、320／390px 触控、键盘、复杂真实 DAG、长分支名和多详情。Git 写操作仅在虚构仓库。
- 同步 README、架构、设计、主题和验证记录。确认发布源码与验收一致后，仅更新身份已核实的 MeGit；不改用户白板。

本轮完成树形详情及其现有动作接入；worktree 创建与跨分支写入式合并属于设计中的后续能力，不用无效按钮占位。

状态：已完成第一阶段并更新正式本地预览（2026-11-17）。

- 数据与纯布局：7 项接口测试、6 项布局测试通过，含远端树干完整历史、超长合法引用、压缩后删除分支引用仍保留合流。
- 产品接入：默认分支树、树干视角、点选详情、固定 SHA 比较、分支查找、远端显示、历史边界与已有动作已接入；文件和历史按需打开，草稿留在各仓库根组件。
- 回归：`npm run check` 全部通过（131 项测试），完整 `npm run test:e2e` 103 项 Edge 场景通过。只读复核发现的状态竞态、压缩合流与宽面板居中均已复现并修复。
- 发布：冻结源码在 `.worktrees/branch-tree-release-20261117` 正常构建，仅重启已核实的 MeGit 实例；运行于 `127.0.0.1:4317`。正式登记的 3 个仓库均可通过只读分支树接口读取，白板文件发布前后 SHA256 相同。
- 完整证据：`.megit/verification/branch-tree/` 的 `check.log`、`e2e-full.log`、`tested-source.json`、`release-build.log`、`deployment.json` 和产品截图。没有 Git 提交或推送；后续的工作目录创建和写入式跨分支整合仍按设计阶段推进。
