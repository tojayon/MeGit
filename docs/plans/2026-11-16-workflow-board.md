# MeGit 流程白板实施计划

**目标：** 在独立的 MeGit 目录交付浏览器可用的通用多仓库 Git 工具，白板节点与关系是主导航，真实 Git 状态与操作是数据基础。

**架构：** React + React Flow 构成可持久化的流程白板，Node.js 提供同源本机 API，通过无 shell 的参数数组调用系统 Git。白板元数据保存到忽略的 `.megit/`，与仓库内容分开；HTTP 客户端与 Git 服务独立，便于将来替换为桌面桥接。

**技术栈：** TypeScript、React、Vite、React Flow、Express、Vitest、Playwright/Edge。

## 产品范围

- 多流程白板；添加本机仓库、拖动节点、缩放平移、创建与编辑有向关系、保存与恢复布局。
- 关系包括代码整合、开发依赖、交付关系。仅代码整合按 Git 祖先关系判断，其他关系明确是人工定义的流程。连线不自动执行 Git 操作。
- 仓库节点显示当前分支、提交、工作区、领先／落后和远端获取时间。缓存信息不会被称为远端实时状态。
- 侧栏按选中节点展示状态、带父子连线的提交历史、工作区文件和差异。
- 用户主动触发获取远端、暂存／取消暂存、提交、仅快进拉取和已有跟踪分支推送。没有丢弃文件、强推、自动合并或自动发布。
- 空仓库、脱离分支、无远端、分支分叉、未获取来源提交和错误都有独立状态。
- 首版不实现 GitHub 登录／CI／部署查询；“交付关系”不冒充已部署状态，后续通过提供者接口扩展。

## 执行顺序

### 1. 工程与回归入口

建立 `package.json`、TS、Vite、Vitest、ESLint 和 Playwright 配置；安装依赖。目标目录为空，无已有 HEAD，不额外创建 worktree 或自动提交。

### 2. Git 服务（先红后绿）

文件：`tests/git.test.ts`、`server/git.ts`、`shared/types.ts`。
使用临时虚构仓库验证：带空格／中文的文件名、已暂存与未暂存、空仓库、跟踪分支领先落后、合并祖先判断、diff 与参数边界。再实现受限 execFile 调用及状态投影。

### 3. 持久化与本机 API（先红后绿）

文件：`tests/workspace.test.ts`、`tests/api.test.ts`、`server/workspace.ts`、`server/app.ts`、`server/index.ts`。
验证原子写入与重启恢复、版本冲突、关系端点有效性、重复仓库与路径规范化、同源与 Host 校验。仓库操作仅允许访问登记路径，文件操作以真实状态列表为准。

### 4. 流程白板与详情

文件：`src/App.tsx`、`src/components/*`、`src/lib/*`、`src/styles.css`。
使用紧凑浅色工作台、紫色主操作、均匀中性边框、点阵白板。节点显示证据与更新时间，连接提供菜单与表单两种入口。侧栏与空态提供可发现的操作。

### 5. 浏览器验收与启动

文件：`e2e/workflow.spec.ts`、`playwright.config.ts`、`Start-MeGit.cmd`、`README.md`、`docs/ARCHITECTURE.md`。
以独立数据目录和临时 Git 仓库测试添加／连线／移动／刷新恢复、提交与差异、空态与窄屏；运行 `npm test`、`npm run lint`、`npm run build`、`npm run test:e2e`。最后启动 127.0.0.1 本机实例，导入本机 MeWiki 两仓库仅作状态查看，不改动它们的文件或提交。
