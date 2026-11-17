import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const port = Number(process.env.MEGIT_PORT || 4317);
const address = `http://127.0.0.1:${port}`;
const browser =
  process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', address]]
    : process.platform === 'darwin'
      ? ['open', [address]]
      : ['xdg-open', [address]];
function openBrowser() {
  const child = spawn(browser[0], browser[1], {
    windowsHide: true,
    stdio: 'ignore',
    detached: true,
  });
  child.on('error', () => console.log(`请在浏览器打开 ${address}`));
  child.unref();
}
async function running() {
  try {
    const res = await fetch(`${address}/api/session`, { signal: AbortSignal.timeout(1000) });
    return res.ok && typeof (await res.json()).token === 'string';
  } catch {
    return false;
  }
}
async function npm(scriptArgs) {
  const npmCli =
    process.env.npm_execpath ||
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!existsSync(npmCli))
    throw new Error('找不到 npm。请在终端执行 npm install 和 npm run build 后重试。');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...scriptArgs], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`npm ${scriptArgs.join(' ')} 失败，请查看输出。`)),
    );
  });
}
try {
  if (await running()) {
    console.log(`MeGit 已在运行：${address}`);
    openBrowser();
  } else {
    if (!existsSync(path.join(root, 'node_modules'))) await npm(['ci']);
    await npm(['run', 'build']);
    const server = spawn(process.execPath, ['dist-server/server/index.js', '--production'], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
    server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.on('exit', (code) => {
      process.exitCode = code || 0;
    });
    const poll = setInterval(async () => {
      if (await running()) {
        clearInterval(poll);
        clearTimeout(deadline);
        openBrowser();
      }
    }, 500);
    const deadline = setTimeout(() => {
      clearInterval(poll);
      console.error(`未能打开浏览器，请查看服务输出：${address}`);
    }, 20000);
    server.on('exit', () => {
      clearInterval(poll);
      clearTimeout(deadline);
    });
    process.on('SIGINT', () => server.kill());
    process.on('SIGTERM', () => server.kill());
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
