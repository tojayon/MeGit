# Git 详情区域精简 Implementation Plan

> **For Codex:** 按用户本轮要求直接执行，逐项回归；保留并行改动和真实白板，不提交或推送。

**Goal:** 删除右侧两行导航及所有白板编辑操作，保留可调宽、横向并排、独立状态的 Git 详情。

**Architecture:** InspectorDock 仅容纳仓库与关系比较。直接以每列标题和关闭入口识别内容，保留原生内部滚动与键盘访问。白板、分组和说明使用现有入口打开共用原生弹窗；关系编辑与红色移除按钮统一位于左上角选中副工具栏。移除涵盖仓库节点、关系、说明及分组，批量意图原子进入撤销；Git 面板不接收白板写回调。

**Tech Stack:** React、TypeScript、CSS 语义 token、共用 Dialog／PanelHeader／IconButton、i18next、Vitest、Playwright／Edge。

1. 保存当前基线，在独立测试数据中验证旧版仍显示多余导航和白板移除栏。
2. 精简 InspectorDock 的结构和焦点恢复；限定类型为仓库／关系，删除未使用样式与文案，保留 2/3 上限和平滑滚动。
3. 删除 RepositoryPanel／RelationPanel 的白板操作及底栏；将白板、分组、说明编辑放入 Dialog，画布提供关系编辑与选中仓库／关系移除入口。
4. 更新真实组件示例、中英文及相关 Edge 场景；验证独立草稿、无标签浏览、弹窗焦点、移除与撤销、双主题和窄屏。
5. 固定完成的源码副本，运行 npm run check 与完整 Edge，更新文档；备份最新真实白板后仅更新 MeGit 服务，再以只读方式核对资源、布局及数据哈希。

状态：实现、复审与页面更新已完成。基线位于 `.megit/verification/git-inspector/before/`；最终 `npm run check` 通过 97 项单元／接口测试，完整 Edge 71 项通过，纳入最新关闭焦点保护后另有 20 项详情／浮层回归通过。

正式服务重启被自动审批以“blocked by policy”拒绝，保留 7412 进程。核对运行服务与验收副本的 8 个后端构建文件逐字节一致后，通过正常 Vite 构建更新其静态页面；未手改构建产物、清空旧资源或改写真实白板。正式首页、JS、CSS 与品牌 SVG 均与验收构建一致，双主题／双语及 390px 只读视觉核对通过。详情见 `docs/VERIFICATION.md` 本次记录和 `.megit/verification/git-inspector/`。
