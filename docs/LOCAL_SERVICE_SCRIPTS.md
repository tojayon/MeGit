# MeGit local service script specification (Windows)

[简体中文](LOCAL_SERVICE_SCRIPTS.zh-CN.md)

**The repository provides a start entry; MeGit starts, stops, and restarts it.** No separate stop or restart script or MeGit-specific manifest is needed. Save one local configuration per registered worktree under **Repository details → Local service → Configure**. Saving does not start the service.

## Entry format

| Setting | Accepted value |
| --- | --- |
| Working directory | Relative to the worktree root, such as `.` or `apps/web`. The entry runs in this directory. |
| npm script | A key under `scripts` in the working directory's `package.json`, such as `dev` or `serve:local`. Do not enter `npm run dev` or arguments. Use 1–80 characters, starting with an ASCII letter or digit and continuing with ASCII letters, digits, colons, underscores, or hyphens. |
| PowerShell script | A `.ps1` path relative to the **working directory**, such as `scripts/dev.ps1`. Do not enter a PowerShell command or arguments. MeGit uses Windows PowerShell non-interactively, without loading user profiles or bypassing local execution policy. |
| TCP port (optional) | The fixed port the service actually listens on, from `1` to `65535`. MeGit uses it for checks, not to pass an argument or configure the application. |

The directory and entry must exist in the registered worktree. Absolute paths, `..`, `.git`, and links that escape the allowed directory are rejected. The `.ps1` file or `package.json` must be at most 512 KiB. MeGit does not automatically run the selected npm script's `pre` or `post` scripts. Put required setup and arguments in the entry itself.

## Runtime contract

- **Stay in the foreground and run unattended.** Invoke the service directly and wait for it to exit. Do not use `Start-Process` to hand it off to another terminal or independent process, or depend on interactive input or elevation. If startup fails, report why and exit nonzero instead of keeping a dead service's wrapper alive.
- **Listen on loopback.** Bind development services to `127.0.0.1`. With a configured port, MeGit reports Running only when a process in its own managed group listens on that port. Startup times out after roughly 30 seconds without a listener. This is not an HTTP health check. Without a port, MeGit tracks group liveness, not application readiness.
- **Do not kill a process by port.** Restart stops only the old group managed by MeGit and then launches the entry again. If another process owns the port, MeGit reports the conflict without adopting or stopping it. Stop an existing service in its original terminal or tool before first handing it over, or change the port in both the project and MeGit.
- **Do not rely on shutdown hooks.** On Stop, Restart, or MeGit backend exit, the group may be terminated without running `finally`, exit hooks, or pending writes. This feature is not for services that require reliable graceful shutdown.
- **Run only reviewed code.** The entry and dependencies run with your user permissions. Review and save again after a branch, commit, or entry-file change. MeGit does not audit every file the entry calls. Standard output and error appear under Recent output; do not print secrets or the full environment.

## Minimal working example

Create `scripts/dev-server.cjs` in the repository. This HTTP server is only for verifying the integration. Replace the entry with your real start command afterward.

```js
const { createServer } = require('node:http');

createServer((_request, response) => response.end('MeGit local service\n')).listen(
  5173,
  '127.0.0.1',
  () => console.log('Listening on http://127.0.0.1:5173'),
);
```

**Option A: npm.** Merge the `dev` entry into `scripts` in the root `package.json`. If the project already has a suitable `dev` script, configure it as-is rather than overwriting it.

```json
{
  "scripts": {
    "dev": "node scripts/dev-server.cjs"
  }
}
```

**Option B: PowerShell.** Create `scripts/dev.ps1` to invoke Node.js directly and return its exit code.

```powershell
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'dev-server.cjs')
exit $LASTEXITCODE
```

| Option | Type | Working directory | Entry | TCP port |
| --- | --- | --- | --- | --- |
| A | npm script | `.` | `dev` | `5173` |
| B | PowerShell script | `.` | `scripts/dev.ps1` | `5173` |

Pick one option, review and save, then click Start. To try it in a terminal first, run `npm --ignore-scripts --workspaces=false run dev` or `powershell.exe -NoProfile -NonInteractive -File scripts/dev.ps1` from the project root. Press `Ctrl+C` to stop the manual run before starting it in MeGit to avoid a port conflict.
