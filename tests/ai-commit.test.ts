import { it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture, commitFile, git } from './fixtures';
import * as commitAi from '../server/ai-commit';

it('提交上下文只含暂存内容，受限且识别暂存后的继续修改', async () => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'feature.txt'), 'staged-feature\n');
    await git(f.repo, 'add', '--', 'feature.txt');
    await writeFile(path.join(f.repo, 'feature.txt'), 'unstaged-private-content\n');
    await writeFile(path.join(f.repo, 'secret.txt'), 'untracked-secret');
    const context = await commitAi.readCommitContext(f.repo);
    expect(context.patch).toContain('staged-feature');
    expect(context.patch).not.toMatch(/unstaged-private-content|untracked-secret|secret.txt/);
    expect(context.patch.length).toBeLessThanOrEqual(48000);
    expect((await commitAi.readCommitContext(f.repo)).fingerprint).toBe(context.fingerprint);
    await git(f.repo, 'add', '--', 'feature.txt');
    expect((await commitAi.readCommitContext(f.repo)).fingerprint).not.toBe(context.fingerprint);
  } finally {
    await f.cleanup();
  }
});

it('未暂存时拒绝生成，模型结果只接受单行简短文本', async () => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await expect(commitAi.readCommitContext(f.repo)).rejects.toMatchObject({
      code: 'stageRequired',
    });
    expect(commitAi.commitMessage('  feat: add search  ')).toBe('feat: add search');
    for (const value of ['', 'title\nbody', 'x'.repeat(241), '```git commit```'])
      expect(() => commitAi.commitMessage(value)).toThrow();
  } finally {
    await f.cleanup();
  }
});

it('超大暂存差异有界截断，二进制文件不发送原始数据，首次提交也可生成', async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.repo, 'large.txt'), 'large-change\n'.repeat(800000));
    await writeFile(path.join(f.repo, 'asset.bin'), Buffer.from([0, 1, 2, 3]));
    await git(f.repo, 'add', '--', 'large.txt', 'asset.bin');
    const context = await commitAi.readCommitContext(f.repo);
    expect(context.truncated).toBe(true);
    expect(context.patch.length).toBe(48000);
    expect(context.patch).toContain('Binary files');
    expect(context.patch).not.toContain('GIT binary patch');
    expect(await git(f.repo, 'status', '--porcelain')).toContain('large.txt');
  } finally {
    await f.cleanup();
  }
});
