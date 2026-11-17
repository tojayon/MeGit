# Git 分支管理 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按用户选择继续实现 Git 分支管理，让仓库详情支持创建、切换与安全删除本地分支，并从缓存的远端分支建立本地跟踪分支。

**Architecture:** 扩展既有 GitAction 协议，分支动作继续经本机令牌、登记路径和按仓库串行队列执行。每个动作携带页面看到的当前分支／提交及目标提交，服务重新检查状态、引用与工作树占用；创建／切换不强制覆盖文件，删除只允许已合并且非当前／非占用分支。界面采用现有分支 tab、按需弹窗、双语和语义主题。

**Tech Stack:** React、TypeScript、i18next、Express／Zod、系统 Git、Vitest、Playwright／Edge。

---

### Task 1：分支动作与真实 Git 验证

- 修改 `shared/types.ts`、`shared/refs.ts`：定义 BranchAction 与当前状态／目标 SHA 前置条件，区分分支名和一般提交表达式。为 Git 状态增加操作进行中与分支工作树占用信息。
- 修改 `server/git.ts`：沿用 performAction 队列，验证分支格式、目标引用、页面状态是否过期、未提交文件、正在执行的 merge／rebase 等操作和工作树占用；按完整引用解析本地／远端分支。从远端创建时只设置本地 tracking，不联网。创建后切换为可选；空仓库说明需先完成首次提交。
- 删除前确认目标是当前 HEAD 祖先，再使用 `git branch -d`，保留 Git 的原生安全拒绝；不增加强制删除、自动暂存、自动提交或历史重写。
- 在 `tests/branches.test.ts` 先写并运行失败测试，再实现：中文名、创建／切换、远端 tracking、未合并／当前／工作树占用保护、脏文件与中断操作、页面过期和注入参数。

### Task 2：API 与本地错误

- 修改 `server/app.ts` 的动作判别校验，所有前置条件必须提供且拒绝 force 等额外参数。
- 修改 `shared/messages.ts` 与双语资源，使用稳定错误码；Git 原始诊断仍脱敏并原样显示。
- 在 `tests/api.test.ts` 增加真实临时仓库动作及缺字段、未登记路径、跨站与不支持操作的拒绝回归。

### Task 3：仓库分支界面

- 新建 `src/components/BranchesPanel.tsx`，本地分支提供切换／删除入口，远端分支提供创建本地跟踪分支；显示当前分支、占用和操作状态，支持按名称过滤。
- 创建弹窗选择起点、名称和创建后切换；切换与删除弹窗展示仓库、分支和提交，错误常驻弹窗，处理时防止重复提交。未提交修改或进行中操作的限制在分支页直接可见。
- 修改 `src/components/RepositoryPanel.tsx`、`src/App.tsx`：共用 Git busy 状态；成功后先使用动作响应更新仓库状态，再重新检查白板关系与历史。Git 动作不加入白板历史。
- 修改 `src/styles.css`，同步暗黑／明亮、窄屏、tooltip、键盘及中英文，无新增装饰颜色。

### Task 4：完整验收与正式预览

- 新建 `e2e/branches.spec.ts`，独立数据与临时仓库测试创建、切换、tracking、删除拒绝、冲突／过期保护、错误双语、刷新、历史／关系更新，以及白板撤销不改变分支。
- 执行 `npm run check`、独立端口 `npm run test:e2e`、两主题和窄屏视觉检查；按请求代码审查技能进行只读复审，修重要问题。
- 更新 README、架构和验收记录。只重启核实身份的 MeGit；备份最新工作区，只读验收，不能对真实仓库执行分支测试。

## 约束与状态

- 用户已明确选择 Git 分支管理，本会话直接实施；不创建聊天，不自动提交或推送。
- 工程无提交，保留所有已有源码与用户白板；本批基线放在 `.megit/verification/branches/before/`。
- 状态：已完成。
- 任务 1–4 已交付；`npm run check` 的 74 项单元／接口测试、标准检查、lint 和构建通过；独立端口 4380 的完整 Edge 29 项通过。
- 只读复审发现的 ignored 文件覆盖问题已修复，并通过先失败后通过的真实临时仓库回归。没有遗留重要审查问题。
- 正式预览已更新至 `http://127.0.0.1:4317`；服务仅监听本机，重启及只读验收前后白板哈希一致。证据见 `.megit/verification/branches/` 与 `docs/VERIFICATION.md`。
