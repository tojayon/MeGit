import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
export const git = async (cwd: string, ...args: string[]) =>
  (
    await execute('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, windowsHide: true })
  ).stdout.trim();

export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'megit-test-'));
  const repo = path.join(root, '示例 repo');
  await mkdir(repo);
  await git(repo, 'init', '-b', 'main');
  await git(repo, 'config', 'user.name', 'MeGit Test');
  await git(repo, 'config', 'user.email', 'test@example.invalid');
  await git(repo, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  return {
    root,
    repo,
    cleanup: async () => {
      if (!path.basename(root).startsWith('megit-test-') || path.dirname(root) !== tmpdir())
        throw new Error('Invalid cleanup root');
      await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    },
  };
}

export async function commitFile(repo: string, name = '笔记 example.txt', content = 'first\n') {
  await writeFile(path.join(repo, name), content);
  await git(repo, 'add', '--', name);
  await git(repo, 'commit', '-m', '测试提交');
  return git(repo, 'rev-parse', 'HEAD');
}
