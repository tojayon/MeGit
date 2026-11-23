import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { AppError } from './errors.js';
import type { LocalServiceTarget } from '../shared/local-service.js';
import type { ErrorCode } from '../shared/messages.js';
import { windowsJobSource } from './windows-service-job.js';

const supervisor = Buffer.from(
  `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  Add-Type -TypeDefinition @'
${windowsJobSource}
'@
  [MeGitService]::Run()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  [Console]::Out.WriteLine('failed')
}
`,
  'utf16le',
).toString('base64');

type Event = { status: 'running' | 'starting' } | { error: ErrorCode; ownerPid?: number };

const failures: ReadonlyMap<string, ErrorCode> = new Map([
  ['busy', 'localServicePortBusy'],
  ['duplicate', 'localServiceActive'],
  ['failed', 'localServiceLaunch'],
  ['exit', 'localServiceExited'],
  ['timeout', 'localServiceTimeout'],
]);

function quote(argument: string) {
  return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/, '$&$&')}"`;
}

function powershellPath() {
  return path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

export function resolveProjectNpm(options: {
  backend: string;
  desktop?: boolean;
  searchPath?: string;
  file: (value: string) => boolean;
}) {
  const windows = path.win32;
  const candidates = options.desktop
    ? (options.searchPath || '')
        .split(';')
        .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
        .filter((entry) => windows.isAbsolute(entry) && windows.parse(entry).root.length > 1)
        .map((directory) => windows.join(directory, 'node.exe'))
        .filter((candidate) => candidate.toLowerCase() !== options.backend.toLowerCase())
    : [options.backend];
  for (const executable of candidates) {
    const cli = windows.join(
      windows.dirname(executable),
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    if (options.file(executable) && options.file(cli)) return { executable, cli };
  }
}

function projectNpm() {
  return resolveProjectNpm({
    backend: process.execPath,
    desktop: process.argv.includes('--desktop'),
    searchPath: process.env.PATH,
    file: (value) => {
      try {
        return statSync(value).isFile();
      } catch {
        return false;
      }
    },
  });
}

export function localApplication(kind: LocalServiceTarget['kind']) {
  return kind === 'npm' ? projectNpm()?.cli : powershellPath();
}

export function startWindowsService(
  target: LocalServiceTarget,
  onEvent: (event: Event) => void,
  onLog: (text: string) => void,
  repository = target.directory,
) {
  const npm = target.kind === 'npm' ? projectNpm() : undefined;
  if (target.kind === 'npm' && !npm) throw new AppError('localServiceToolMissing', 503);
  const executable = npm?.executable ?? powershellPath();
  const args = npm
    ? [
        npm.cli,
        '--ignore-scripts',
        '--workspaces=false',
        '--no-update-notifier',
        'run',
        target.entry,
      ]
    : ['-NoProfile', '-NonInteractive', '-File', target.entry];
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^MEGIT_/i.test(key)),
  );
  if (npm && process.argv.includes('--desktop')) {
    const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'Path';
    env[pathKey] = `${path.dirname(npm.executable)};${env[pathKey] ?? ''}`;
  }
  const child = spawn(
    powershellPath(),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', supervisor],
    {
      windowsHide: true,
      cwd: path.dirname(process.execPath),
      env: {
        ...env,
        MEGIT_CHILD_FILE: executable,
        MEGIT_CHILD_ARGS: [executable, ...args].map(quote).join(' '),
        MEGIT_CHILD_CWD: target.directory,
        MEGIT_CHILD_PORT: String(target.port ?? 0),
        MEGIT_CHILD_KEY: createHash('sha256').update(repository.toLowerCase()).digest('hex'),
      },
    },
  );
  const protocol = createInterface({ input: child.stdout });
  protocol.on('line', (line) => {
    const [name, value] = line.split(' ');
    if (name === 'running' || name === 'starting') onEvent({ status: name });
    const error = failures.get(name);
    if (error) {
      const ownerPid = Number(value);
      onEvent({ error, ...(name === 'busy' && ownerPid > 0 ? { ownerPid } : {}) });
    }
  });
  child.stdin.on('error', () => {});
  child.stderr.setEncoding('utf8').on('data', onLog);
  child.on('error', (error) => {
    onLog(error.message);
    onEvent({ error: 'localServiceLaunch' });
  });
  let finished = false;
  const done = new Promise<void>((resolve) =>
    child.once('close', () => {
      finished = true;
      protocol.close();
      resolve();
    }),
  );
  return {
    done,
    async stop() {
      if (finished) return;
      child.stdin.end();
      const timeout = setTimeout(() => child.kill(), 8000).unref();
      try {
        await done;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
