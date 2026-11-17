# 左侧导航折叠与品牌标志调整

> 按 writing-plans 梳理，当前会话直接实施。遵循项目约定，不自动提交或推送。

**目标：** 让 Ribbon 成为工作流导航的折叠形态，去掉图标白底，并缩小展开态完整 Logo。

**结构：** 使用一个 `WorkspaceNavigation` 组件替代并排的 Ribbon 和侧栏。桌面展开宽 212px，折叠宽 56px；完整 Logo 宽 84px，独立图形宽 34px，容器背景透明。移动端沿用抽屉，桌面折叠偏好与移动端临时开关独立。

**技术：** React、TypeScript、现有 i18next、CSS 语义 token、Vitest 和 Playwright / Edge。

## 实施步骤

1. 在 `tests/preferences.test.ts` 补充折叠偏好持久化、旧配置兼容和无效类型回退；在 `e2e/navigation.spec.ts` 验证单导航区、透明 Logo、展开尺寸、刷新恢复及窄屏键盘行为。先运行新测试，确认缺失行为导致失败。
2. 在 `src/preferences/storage.ts` 的版本 1 协议中增加 `navigationCollapsed`，默认展开；沿用现有存储与跨页订阅。
3. 新建 `src/components/WorkspaceNavigation.tsx`，整合原有导航入口、工作流和仓库列表；列表独立滚动，设置与帮助固定在底部。接入 `src/App.tsx`，添加展开／收起及移动端控制关系和焦点管理。
4. 调整 `src/styles.css`，移除白底与旧导航重复规则，使用现有主题颜色；同步中英文展开提示。Tooltip 的 Escape 只在其打开时消耗，保证下一次 Escape 能关闭移动端抽屉。
5. 运行 `npm run check` 和独立端口／数据目录的 `npm run test:e2e`，核对暗黑／明亮、中文／英文、折叠／展开与窄屏截图。证据放 `.megit/verification/navigation/`。
6. 更新 README、品牌使用说明、主题规范与验证记录；重新构建，仅重启经过身份核实的 4317 MeGit 实例，比较原白板文件哈希并检查正式资源响应。

## 验收要点

- 仅一个导航容器；折叠后白板可用宽度增加，图标无白色底托。
- 展开时完整 Logo 小于原 112px；主要入口、工作流与仓库访问保持可用。
- 刷新恢复桌面折叠选择；窄屏抽屉不改变该偏好，隐藏时不能键盘访问。
- Tab 不逃离打开的抽屉，Escape 可关闭说明和抽屉，关闭后返回打开按钮；弹窗关闭后回到抽屉内原入口。
- 不修改品牌 SVG 路径、用户白板或真实仓库内容。
