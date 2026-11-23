import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';

const production = process.argv.includes('--production');
const desktop = production && process.argv.includes('--desktop');
const root = production
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MEGIT_PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('MEGIT_PORT 必须是 1024–65535 的整数。');
const app = createApp({
  dataDirectory: path.resolve(process.env.MEGIT_DATA_DIR || path.join(root, '.megit')),
});
let closeVite: (() => Promise<void>) | undefined;
if (production) {
  app.use(express.static(path.join(root, 'dist'), { index: 'index.html' }));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: path.join(root, 'dist') }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: { middlewareMode: true, ws: { host: '127.0.0.1', port: port + 10 } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}
const server = app.listen(port, '127.0.0.1');
server.once('listening', () => {
  if (desktop) {
    console.log('READY');
    return;
  }
  console.log(
    `\n  MeGit · 开发流程\n  http://127.0.0.1:${port}\n  ${production ? '本地运行' : '开发模式'} · 按 Ctrl+C 停止\n`,
  );
});
server.on('error', (error: NodeJS.ErrnoException) => {
  process.exitCode = 1;
  if (desktop) {
    console.log(error.code === 'EADDRINUSE' ? 'PORT_BUSY' : 'FAILED');
    process.stdin.destroy();
    return;
  }
  console.error(
    error.code === 'EADDRINUSE'
      ? `端口 ${port} 已占用，请打开现有 MeGit 或设置 MEGIT_PORT。`
      : error.message,
  );
  void closeVite?.().finally(() => process.exit(1));
});
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  if (desktop) process.stdin.destroy();
  server.close();
  void app.locals.closeLocalServices();
  void closeVite?.();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, close);
if (desktop) {
  process.stdin.once('end', close).once('error', close).resume();
}
