# 白板工具、说明与导出 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成已获同意的第二批白板能力：选择与平移、独立锁定、多选排列、白板历史、人工说明、聚焦和干净导出。

**Architecture:** 仓库节点、仓库关系保持原协议，新增可选 notes 和 layoutLocked 兼容旧工作区。历史按白板保存最多 50 次内容编辑，仍走串行自动保存；revision、视角、全局仓库索引与 Git 操作不参与撤销。React Flow 负责显示与临时选择，纯函数负责共同位移、排列和投影，SVG 导出只序列化当前显示内容。

**Tech Stack:** React 19、TypeScript、React Flow 12、i18next、Zod、Vitest、Playwright / Edge。

---

### Task 1：数据与历史

- 修改 `shared/types.ts`、`server/workspace.ts`，增加独立 FlowNote 与可选字段，验证唯一标识、坐标、文本长度以及说明不能成为 Git 比较端点。
- 新建 `src/lib/board-history.ts`，为既有白板记录前后内容；忽略视角与锁定，切换白板保持各自历史。撤销保留当前 revision、仓库登记及其他白板，新的内容编辑清理 redo。
- 集成 `src/lib/use-workspace.ts`，所有历史编辑使用现有保存序列，冲突后停止写入。
- 先在 `tests/workspace.test.ts`、`tests/board-history.test.ts` 添加失败测试，运行专项测试，再实现并验证。

### Task 2：选择、移动和排列

- 扩展 `src/lib/whiteboard.ts`：将所选分组展开为互斥移动单元，混合说明与仓库共同限幅，组加成员不重复移动，排列时分组保持内部间距。
- 在 `tests/whiteboard.test.ts` 验证整组与混合多选、对齐与等间距、坐标边界和布局锁定。
- 修改 `src/components/FlowCanvas.tsx`，支持 Shift / Ctrl 多选与框选、选择 / 平移模式、布局锁定与独立缩放锁定、键盘移动，修复受控位置与历史回放同步。
- 多选时显示精简排列工具，支持按所选仓库快速分组。

### Task 3：人工说明与聚焦

- 新建 `src/components/NotePanel.tsx`，新增说明、编辑正文与移除；节点明确显示“人工说明”，没有 Git 端口和 Git 状态。
- 集成 `src/App.tsx`，维护多选与说明选择，接入撤销 / 重做按钮和非文本输入场景的快捷键。
- 支持聚焦所选分组 / 节点及其上下游、退出聚焦；过滤只作用显示，不改原始白板关系和仓库状态。

### Task 4：导出与完整验收

- 新建 `src/lib/board-export.ts`，输出独立 SVG，提供 PNG 转换；保留组、节点、关系、标签与当前主题，不带工具栏、选择框、文件路径、凭据和隐藏详情。文本进行 XML 转义。
- 同步 `src/themes.css`、`src/styles.css` 和双语资源，验证窄屏、键盘、tooltip、暗黑 / 明亮。
- 新增 `e2e/whiteboard-tools.spec.ts`，用独立数据目录测试历史、锁定、说明、排列、聚焦、下载以及 Git 操作不受撤销影响。
- 执行 `npm run check` 与独立端口完整 `npm run test:e2e`，核对两主题截图；按审查技能要求进行只读审查，修复重要问题。
- 更新 README、架构与验证记录。构建后核实 4317 端口进程，备份最新工作区，只重启 MeGit，验收不写真实数据。

## 约束与执行状态

- 用户已授权继续，本计划在当前会话直接执行，不创建新聊天，不自动提交或推送。
- 工程尚无提交，源文件基线保存在忽略目录 `.megit/verification/whiteboard-tools/before/`，保持现有用户数据。
- 状态：已完成。
- 任务 1–4 已交付。`npm run check`：55 项单元／接口测试及标准、lint、构建通过；独立端口完整 Edge 20 项通过。只读审查三项重要边界已修复并专项复核。
- 正式预览已更新至 `http://127.0.0.1:4317`，服务仅监听本机；重启和只读验收前后工作区哈希保持一致。详细记录见 `docs/VERIFICATION.md`，证据见 `.megit/verification/whiteboard-tools/`。
