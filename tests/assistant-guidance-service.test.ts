import { expect, it } from 'vitest';
import path from 'node:path';
import { AssistantService } from '../server/assistant';
import { AppError } from '../server/errors';
import { fixture, commitFile, git } from './fixtures';

it('兼容旧回复并从实际状态补引导；过滤越界、重复和失效入口，不执行操作', async () => {
  const f = await fixture();
  try {
    const head = await commitFile(f.repo);
    let output: unknown = { text: '仓库尚未设置远端。', operations: [] };
    let context = '';
    const service = new AssistantService({
      repository: async (id) => {
        if (id !== 'one') throw new AppError('repositoryMissing', 404);
        return { id, name: 'One', path: f.repo };
      },
      complete: async (messages) => {
        context = JSON.stringify(messages);
        return JSON.stringify(output);
      },
    });
    const input = {
      repositoryIds: ['one'],
      prompt: '检查仓库',
      language: 'zh-CN' as const,
      history: [],
      includeStagedDiff: false,
    };
    expect((await service.chat(input)).guides).toEqual([
      { repositoryId: 'one', kind: 'addRemote' },
    ]);
    expect(context).toContain('availableGuides');
    expect(context).not.toContain(f.repo);
    output = {
      text: '设置远端',
      operations: [],
      guides: [
        { repositoryId: 'one', kind: 'addRemote' },
        { repositoryId: 'one', kind: 'addRemote' },
        { repositoryId: 'outside', kind: 'worktree' },
        { repositoryId: 'one', kind: 'publishBranch' },
      ],
    };
    expect((await service.chat(input)).guides).toEqual([
      { repositoryId: 'one', kind: 'addRemote' },
    ]);
    await git(f.repo, 'remote', 'add', 'origin', path.join(f.root, 'remote.git'));
    expect((await service.chat(input)).guides).toEqual([
      { repositoryId: 'one', kind: 'publishBranch' },
    ]);
    expect((await service.repositoryState('one')).remotes).toEqual(['origin']);
    await expect(service.repositoryState('outside')).rejects.toMatchObject({
      code: 'repositoryMissing',
    });
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'diff', '--cached')).toBe('');
  } finally {
    await f.cleanup();
  }
});
