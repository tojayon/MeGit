# Git 学习素材复用接口

**目标：** 为后续右侧功能按钮的动画／图片 tooltip 提供可直接启用的接口，素材与课堂保持同源。

**结构：** 稳定的操作 ID 对应课堂语义步骤；紧凑预览复用 `GitLearningScene`。`Button`、`IconButton` 通过可选 `learningDemo` 接入，默认行为保持现状；独立 `GitLearningPreview` 支持动画或静态图解。示例只放在 `/design-system`，不批量启用产品按钮。

**交互：** 悬停稍候打开，键盘聚焦立即查看；演示播放一遍后保留结果，减少动态或静态模式直接展示结果帧。关闭即卸载并清理计时器，离开／激活／Escape／失焦沿用共用 tooltip 规则。浮层没有操作按钮，不执行 Git、API 或工作区写入。

**技术：** React、TypeScript、CSS、i18next、原生 Popover、Vitest、Edge；不新增依赖或颜色。

1. 先用失败测试约束语义素材引用、fetch／pull／push 区别、静态模式和延迟／关闭行为。
2. 增加 `src/lib/git-learning-media.ts` 索引与 `GitLearningPreview`，为共用场景提供紧凑展示。
3. 增加 `GitDemoTooltip`，为基础按钮增加可选参数，保持单个 tooltip 和原操作回调。
4. 增加真实双语示例、接入文档；覆盖只在可见时播放、最终停帧、键盘、减少动态、两主题及窄屏。
5. 运行 `npm run check`、相关与完整独立 Edge 回归；复审后更新当前本机预览并只读核验。保留所有已有改动、真实白板，不提交或推送。

状态：已完成。14 类素材、按钮可选参数、独立包装、静态预览及双语真实示例已接入；详细契约见 [Git 功能演示接口](../GIT_LEARNING_MEDIA.md)。

验证：`npm run check` 通过 112 项单元／接口测试及全部标准、色卡、ESLint、前后端构建；完整 `npm run test:e2e` 94 项 Edge 通过。修正键盘聚焦自动滚动的迟到通知误关提示，5 项高级提示专项及普通浮层回归通过。正式预览已更新，四种环境逐项核验 14 类素材及原课堂入口，56 份图解均不溢出，无页面错误或 API 写请求，白板哈希不变。证据见 `.megit/verification/git-learning-media/`。
