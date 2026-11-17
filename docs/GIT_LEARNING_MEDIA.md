# Git 功能演示接口

为功能按钮选择课堂中的一个语义操作，即可复用同一套图形、动画、双语短提示和替代文本。真实示例位于 [设计规范页](http://127.0.0.1:4317/design-system)的“功能演示提示”。目前仅提供接口与示例，产品中的已有按钮按需逐个启用。

## 按钮接入

```tsx
<Button learningDemo="stage" onClick={stageSelectedFiles}>
  {t('repository.stage')}
</Button>

<IconButton
  label={t('repository.fetch')}
  learningDemo="fetch"
  placement="top"
  onClick={fetchRepository}
>
  <Download size={16} />
</IconButton>
```

`learningDemo` 为类型化的 `GitLearningDemoId`；省略时沿用原来的普通按钮／文字 tooltip。可选 `learningPlayback="still"` 使用静态结果帧，默认 `animated`。图标按钮保持一个 tooltip，`learningDemo` 取代其原有 `help` 内容，不要再套 `Tooltip`。按钮原有的名称、操作回调、忙碌与禁用规则继续由调用方负责；必要错误与操作限制仍应在面板中直接显示。

自定义原生控件可使用独立包装：

```tsx
<GitDemoTooltip demo="merge" placement="right">
  <button type="button" onClick={openMergeDialog}>
    {t('learning.preview.titles.merge')}
  </button>
</GitDemoTooltip>
```

触发器必须是单个可聚焦、可接收 `aria-describedby` 的元素。不要用它包装已有内置 tooltip 的 `IconButton`。

## 动画与静态图解

```tsx
<GitLearningPreview demo="push" />
<GitLearningPreview demo="stage" playback="still" />
<GitLearningPreview demo="stage" playback="still" poster="before" />
<GitLearningPreview demo="resolveConflict" active={previewVisible} />
```

- `playback`：`animated` 或 `still`。动画每 1400ms 推进一帧，最多四帧，播放一遍后停在结果；不无限循环。单帧素材直接展示结果。
- `poster`：`before` 或 `after`，默认 `after`。仅在静态、减少动态或不活跃时决定展示哪一帧。
- `active`：默认 `true`。容器保持挂载但隐藏时传 `false`，取消播放计时器并展示海报帧；重新设为 `true` 后从原进度继续。需要从头重播时重新挂载。窗口失焦或页面隐藏会暂停本次播放，重新挂载可重播。
- 变化 `demo`、`playback` 或 `poster` 会重新开始预览；卸载时清理计时器与监听。
- 系统启用“减少动态效果”时直接显示静态海报，关闭子图形动画。所有资源本地加载，复用两主题语义 token。

这些图解可作为后续图片演示的本地矢量展示，提供 `role="img"` 和当前语言的替代文本。无需另存一份图片或维护第二套 Git 场景。

## 素材索引

`src/lib/git-learning-media.ts` 导出 `gitLearningDemos`、`gitLearningDemoIds` 和 `getGitLearningDemo(id)`。读取结果包含操作 ID、课程 ID、原课程和原步骤对象；通过语义步骤名称选帧，避免课程序号变化影响按钮。

| 操作 ID           | 内容                                   | 来源课程   |
| ----------------- | -------------------------------------- | ---------- |
| `stage`           | 复制工作内容到暂存区，工作文件保留     | 暂存与提交 |
| `commit`          | 提交已暂存版本，保留后续未暂存修改     | 暂存与提交 |
| `unstage`         | 恢复暂存区，保留工作文件               | 撤销与恢复 |
| `discard`         | 丢弃未提交修改                         | 撤销与恢复 |
| `revert`          | 新增反向提交，保留原历史               | 撤销与恢复 |
| `createBranch`    | 增加分支指针                           | 分支与切换 |
| `switchBranch`    | 切换 HEAD 与工作快照，不产生新提交     | 分支与切换 |
| `merge`           | 合并不同文件的独立改动，保留双亲       | 合并分支   |
| `clone`           | 克隆后的本地、跟踪与远端引用（单帧）   | 远端同步   |
| `fetch`           | 只更新 `origin/main`，本地 `main` 不动 | 远端同步   |
| `pull`            | 获取，再快进整合                       | 远端同步   |
| `push`            | 上传本地提交并快进远端分支             | 远端同步   |
| `resolveConflict` | 编辑 → 暂存标记解决 → 提交             | 解决冲突   |
| `snapshot`        | 完整项目快照与相同文件对象复用         | 提交是快照 |

`pull`／`push` 演示的是当前场景中可快进的情况，不表示所有真实操作都能成功；`merge` 不替代冲突说明。安全删除分支、rebase、stash 等尚无素材，不应借用语义不同的演示。新增操作先在课堂中补齐真实 Git 语义与中英文步骤，再登记操作 ID。

## 提示生命周期

鼠标悬停 500ms 后打开，键盘聚焦立即显示；触摸不模拟悬停。移入提示可继续看，离开后短暂延迟收起。激活、外点、Escape、实际外部滚动、窗口变化／失焦或页面隐藏均关闭；取消等待后不会迟到弹出。焦点产生的滚动通知如果在提示显示后才送达、但位置已经稳定，不会误关提示。

提示通过共用 `Tooltip` 按需挂载，进入浏览器原生顶层，并在内容尺寸变化后重新避让视口。关闭即卸载预览，不保留后台播放。内容没有按钮、链接或真实仓库资料；需要进一步操作时放进独立面板或课堂。

## 验收

素材索引与预览不依赖 `api`、`useWorkspace`、服务端或系统 Git。虚构提交、文件和分支仅存在内存中，展示素材不会触发业务回调。

新增或调整素材后运行 `npm run check`，并覆盖 `e2e/git-learning-media.spec.ts`、课堂、普通浮层和设计规范场景。验收动画只播放一次、关闭卸载、等待取消、聚焦自动滚动、静态帧、两主题双语、减少动态、窄屏、模态顶层及零 API 请求。
