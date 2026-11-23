# MeGit 本地服务脚本规范（Windows）

[English](LOCAL_SERVICE_SCRIPTS.md)

**仓库只提供启动入口，MeGit 负责启动、停止和重启。** 不需要另外编写停止或重启脚本，也不需要 MeGit 专用配置文件。在 **仓库详情 → 本地服务 → 配置** 中，每个登记的工作树可保存一份本机配置；保存不会启动服务。

## 入口格式

| 配置项 | 填写规则 |
| --- | --- |
| 工作目录 | 相对于工作树根目录，例如 `.` 或 `apps/web`。脚本在该目录下运行。 |
| npm 脚本 | 填写工作目录中 `package.json` 的 `scripts` 键名，例如 `dev` 或 `serve:local`，不要填 `npm run dev` 或附带参数。名称为 1–80 个字符，首字符为 ASCII 字母或数字，其余可用 ASCII 字母、数字、冒号、下划线和连字符。 |
| PowerShell 脚本 | 填写相对于**工作目录**的 `.ps1` 文件路径，例如 `scripts/dev.ps1`，不要填 PowerShell 命令或附带参数。MeGit 使用 Windows PowerShell 非交互运行，不加载用户配置文件，也不绕过本机执行策略。 |
| TCP 端口（可选） | 填写服务实际监听的固定端口，范围为 `1`–`65535`。此项仅用于检查，不会作为参数传给脚本，也不会修改服务配置。 |

目录和入口必须实际存在于登记的工作树内，不能使用绝对路径、`..`、`.git`，也不能通过链接跳出允许范围。`.ps1` 和 `package.json` 文件不得大于 512 KiB。MeGit 不会自动运行选中 npm 脚本的 `pre` / `post` 脚本；需要的准备步骤或参数应显式写在入口中。

## 运行约定

- **前台常驻、无需交互。** 直接调用服务程序并等待它退出。不要用 `Start-Process` 把服务交给另一个终端或独立进程，也不要依赖交互输入或提权。启动失败时输出原因并以非零退出码结束，不要用空循环掩盖服务已退出的情况。
- **只监听本机。** 将开发服务绑定到 `127.0.0.1`。填了端口时，MeGit 等自己启动的进程组监听该端口才显示「运行中」；启动阶段约 30 秒未监听会报超时。这不是 HTTP 健康检查。端口留空时只跟踪进程组，不判断应用是否就绪。
- **不要按端口结束进程。** 「重启」只停止 MeGit 自己管理的旧进程组，再启动入口。外部进程占用端口时，MeGit 报告冲突，不结束或接管它。首次迁移请先从原终端或工具停止旧服务，或者在项目和 MeGit 中一起更换端口。
- **不要依赖退出清理。** 停止、重启或 MeGit 后端退出时，进程组可能被直接终止，不保证执行 `finally`、退出钩子或保存未写入的数据。不适合要求可靠优雅关闭的服务。
- **只运行已审阅的代码。** 入口及依赖以当前用户权限运行。切换分支、更换提交或修改入口后须重新审核保存；MeGit 不会审计入口调用的每个文件。标准输出和标准错误会显示在「最近输出」中，不要输出密钥或完整环境变量。

## 最小可运行示例

在仓库中创建 `scripts/dev-server.cjs`。这个 HTTP 服务只用于验证接入；接入成功后，把启动入口换成项目实际的启动程序。

```js
const { createServer } = require('node:http');

createServer((_request, response) => response.end('MeGit local service\n')).listen(
  5173,
  '127.0.0.1',
  () => console.log('Listening on http://127.0.0.1:5173'),
);
```

**选项 A：npm。** 将 `dev` 项合并到根目录 `package.json` 的 `scripts` 中；若项目已有可用的 `dev`，直接配置现有脚本，不必覆盖。

```json
{
  "scripts": {
    "dev": "node scripts/dev-server.cjs"
  }
}
```

**选项 B：PowerShell。** 创建 `scripts/dev.ps1`，直接调用 Node.js，并把程序的退出码返回给调用者。

```powershell
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'dev-server.cjs')
exit $LASTEXITCODE
```

| 选项 | 类型 | 工作目录 | 入口 | TCP 端口 |
| --- | --- | --- | --- | --- |
| A | npm 脚本 | `.` | `dev` | `5173` |
| B | PowerShell 脚本 | `.` | `scripts/dev.ps1` | `5173` |

任选一种，审核并保存后点「启动」。也可先在项目根目录用 `npm --ignore-scripts --workspaces=false run dev` 或 `powershell.exe -NoProfile -NonInteractive -File scripts/dev.ps1` 试跑。试跑结束后先按 `Ctrl+C` 停止，再交给 MeGit，避免端口冲突。
