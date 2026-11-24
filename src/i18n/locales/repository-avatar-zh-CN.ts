export default {
  title: '仓库头像',
  configure: '设置仓库头像',
  configureHelp:
    '从这个仓库中选择项目 Logo，统一用于工作流、仓库列表和详情。只保存图片的相对路径，不修改仓库文件或 Git 历史；也可以恢复默认图标。',
  preview: '{{name}}的头像预览',
  default: '默认仓库图标',
  reset: '恢复默认图标',
  help: '选择仓库中的 SVG、PNG、JPEG、WebP、GIF 或 ICO 图片，最大 1 MiB。同一仓库在所有工作流中共用头像。',
  browse: '浏览仓库图片',
  root: '仓库根目录',
  parent: '上一级目录',
  openDirectory: '打开目录 {{name}}',
  selectImage: '选择图片 {{name}}',
  empty: '此目录没有可选图片或子目录。',
  decodeError: '无法显示这张图片，请选择有效的项目图标。',
  previous: '上一页',
  next: '下一页',
  apply: '使用此头像',
  example: '仓库头像示例',
  exampleHelp:
    '同一个组件显示默认图标、项目 Logo 及图片不可用时的回退。点击标题图标可切换本地示例，不读取仓库。',
} as const;
