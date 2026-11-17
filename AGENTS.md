# MeGit 开发约定

- 使用简体中文沟通。MeGit 是通用的本机 Git 流程白板，保留多仓库节点与有向关系这一核心交互。
- 先读 [架构](docs/ARCHITECTURE.md)和[主题与国际化规范](docs/THEME_I18N.md)。主题与多语言是每项用户可见开发的验收条件。
- UI 必须遵循 [界面开发原则](docs/UI_GUIDELINES.md)：避免不必要的次级标签与描述，用布局解释关系；简短说明优先 tooltip；通过渐进式披露兼顾简洁和信息完整。tooltip 支持悬停、键盘聚焦和 Escape；必要状态与错误不能隐藏。
- 尺寸、排版、组件与交互遵循 [产品设计规范](docs/DESIGN_SYSTEM.md)，共用非颜色 token 放在 `src/tokens.css`。优先复用 `Button`、`IconButton`、`Field`、`PanelHeader`；更新高频组件时同步 `/design-system` 真实示例及状态验收。
- 所有新界面必须同时支持暗黑和明亮，首次默认暗黑。颜色只在 `src/themes.css` 定义，组件与布局使用语义 token，不按主题复制组件。
- 产品配色必须遵循 [品牌配色规范](docs/COLOR_GUIDELINES.md) 与 `public/brand/palette.json`：深蓝、亮青、品牌绿和中性色为基础；警告／危险仅使用登记的功能扩展色。新颜色先补色卡与两套主题，并通过对比度和颜色一致性检查。
- 所有应用文案、无障碍名称、提示和错误使用 i18next／react-i18next。简体中文与英文同步维护；使用稳定语义键、插值、复数和 Intl 格式化。
- API 应用错误返回 `shared/messages.ts` 的稳定代码，前端按当前语言呈现。Git 原始诊断保留且脱敏。仓库名、工作流名、自定义关系名、提交内容和文件内容不翻译、不改写。
- 字体、语言资源与图形资源从本机加载，不依赖运行时 CDN。偏好保存在浏览器的 `megit.preferences`，与 `.megit/workspace.json` 分离。
- 修改后运行 `npm run check` 和相关 Edge 场景 `npm run test:e2e`，同步使用说明与验证记录。正式预览更新后重新构建并仅重启 MeGit 实例。
- 保留已有改动和用户白板，不用真实仓库资料作破坏性测试，不自动提交或推送。测试使用独立数据目录和临时虚构仓库；不手改 dist、dist-server、node_modules 或测试产物。
- 仅绑定 `127.0.0.1`。Git 通过参数数组执行；不得绕过同源、路径、令牌或状态校验。专题工作区放本项目 `.worktrees/`，验证证据放忽略的 `.megit/`。
