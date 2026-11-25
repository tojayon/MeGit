import { expect, it, vi } from 'vitest';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fixture, commitFile, git } from './fixtures';
import { AssistantService } from '../server/assistant';

it('经授权预览全部拟提交改动，生成可审阅说明，确认前不写仓库', async () => {
  const fixtureRepo = await fixture();
  try {
    const head = await commitFile(fixtureRepo.repo);
    const remote = path.join(fixtureRepo.root, 'remote.git');
    await git(fixtureRepo.root, 'init', '--bare', remote);
    await git(fixtureRepo.repo, 'remote', 'add', 'origin', remote);
    await git(fixtureRepo.repo, 'push', '-u', 'origin', 'main');
    await writeFile(path.join(fixtureRepo.repo, '笔记 example.txt'), 'staged draft\n');
    await git(fixtureRepo.repo, 'add', '--', '笔记 example.txt');
    await writeFile(path.join(fixtureRepo.repo, '笔记 example.txt'), 'final tracked change\n');
    await writeFile(path.join(fixtureRepo.repo, 'new.txt'), 'untracked addition\n');
    const originalIndex = await git(fixtureRepo.repo, 'ls-files', '--stage');
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          text: 'Plan ready',
          operations: [
            { repositoryId: 'one', type: 'stageAll' },
            { repositoryId: 'one', type: 'commit', generateMessage: true },
            { repositoryId: 'one', type: 'push' },
          ],
        }),
      )
      .mockResolvedValueOnce('feat: update notes and add a file');
    const service = new AssistantService({
      repository: async () => ({ id: 'one', name: 'One', path: fixtureRepo.repo }),
      complete,
    });
    const reply = await service.chat({
      repositoryIds: ['one'],
      prompt: '暂存所有改动，生成提交说明，再提交并推送',
      language: 'zh-CN',
      history: [],
      includeStagedDiff: false,
      allowCommitDiff: true,
    });
    expect(JSON.stringify(complete.mock.calls[0])).not.toContain('untracked addition');
    const summaryRequest = JSON.stringify(complete.mock.calls[1]);
    expect(summaryRequest).toContain('final tracked change');
    expect(summaryRequest).toContain('untracked addition');
    expect(summaryRequest).not.toContain('staged draft');
    expect(await git(fixtureRepo.repo, 'ls-files', '--stage')).toBe(originalIndex);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(head);
    const commit = reply.plan!.steps.find((step) => step.type === 'commit')!;
    expect(commit.message).toBe('feat: update notes and add a file');
    expect(reply.plan!.steps.map((step) => step.type)).toEqual(['stageAll', 'commit', 'push']);
    expect(
      (await service.execute(reply.plan!.id, { [commit.id]: 'feat: reviewed notes' })).status,
    ).toBe('completed');
    expect(await git(remote, 'log', '-1', '--format=%s', 'main')).toBe('feat: reviewed notes');
  } finally {
    await fixtureRepo.cleanup();
  }
});

it('未允许发送拟提交差异时不读取或发送差异，也不生成可执行计划', async () => {
  const fixtureRepo = await fixture();
  try {
    await writeFile(path.join(fixtureRepo.repo, 'new.txt'), 'private worktree text\n');
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        text: 'Plan',
        operations: [
          { repositoryId: 'one', type: 'stageAll' },
          { repositoryId: 'one', type: 'commit', generateMessage: true },
        ],
      }),
    );
    const service = new AssistantService({
      repository: async () => ({ id: 'one', name: 'One', path: fixtureRepo.repo }),
      complete,
    });
    await expect(
      service.chat({
        repositoryIds: ['one'],
        prompt: '暂存并自动写提交说明',
        language: 'zh-CN',
        history: [],
        includeStagedDiff: false,
      }),
    ).rejects.toMatchObject({ code: 'assistantCommitConsent' });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(complete.mock.calls)).not.toContain('private worktree text');
    expect(await git(fixtureRepo.repo, 'ls-files')).toBe('');
  } finally {
    await fixtureRepo.cleanup();
  }
});

it.each(['filter', 'changed'] as const)(
  '拟提交内容遇到 %s 时不返回可执行计划',
  async (scenario) => {
    const fixtureRepo = await fixture();
    try {
      await commitFile(
        fixtureRepo.repo,
        '.gitattributes',
        scenario === 'filter' ? '*.txt filter=demo\n' : '\n',
      );
      await writeFile(path.join(fixtureRepo.repo, 'new.txt'), 'original content\n');
      const complete = vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            text: 'Plan',
            operations: [
              { repositoryId: 'one', type: 'stageAll' },
              { repositoryId: 'one', type: 'commit', generateMessage: true },
            ],
          }),
        )
        .mockImplementationOnce(async () => {
          await writeFile(path.join(fixtureRepo.repo, 'new.txt'), 'changed during generation\n');
          return 'feat: original content';
        });
      const service = new AssistantService({
        repository: async () => ({ id: 'one', name: 'One', path: fixtureRepo.repo }),
        complete,
      });
      await expect(
        service.chat({
          repositoryIds: ['one'],
          prompt: '暂存并自动写提交说明',
          language: 'zh-CN',
          history: [],
          includeStagedDiff: false,
          allowCommitDiff: true,
        }),
      ).rejects.toMatchObject({
        code: scenario === 'filter' ? 'assistantCommitFilter' : 'assistantStateChanged',
      });
      expect(complete).toHaveBeenCalledTimes(scenario === 'filter' ? 1 : 2);
      expect(await git(fixtureRepo.repo, 'diff', '--cached')).toBe('');
    } finally {
      await fixtureRepo.cleanup();
    }
  },
);

it('先生成只读多仓库计划，确认后才提交及推送，计划只能执行一次', async () => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const remote = path.join(f.root, 'remote.git');
    await git(f.root, 'init', '--bare', remote);
    await git(f.repo, 'remote', 'add', 'origin', remote);
    await git(f.repo, 'push', '-u', 'origin', 'main');
    const other = path.join(f.root, 'other');
    await mkdir(other);
    await git(other, 'init', '-b', 'main');
    await git(other, 'config', 'user.name', 'Test');
    await git(other, 'config', 'user.email', 'test@example.invalid');
    await commitFile(other);
    await writeFile(path.join(f.repo, 'feature.txt'), 'first feature');
    await writeFile(path.join(other, 'other.txt'), 'other feature');
    const repos = [
      { id: 'one', name: 'One', path: f.repo },
      { id: 'two', name: 'Two', path: other },
    ];
    let sent = '';
    const service = new AssistantService({
      repository: async (id) => {
        const repo = repos.find((r) => r.id === id);
        if (!repo) throw new Error('Unknown');
        return repo;
      },
      complete: async (messages) => {
        sent = JSON.stringify(messages);
        return JSON.stringify({
          text: 'Plan ready',
          operations: [
            { repositoryId: 'one', type: 'stageAll' },
            { repositoryId: 'one', type: 'commit', message: 'feat: first feature' },
            { repositoryId: 'one', type: 'push' },
            { repositoryId: 'two', type: 'stageAll' },
            { repositoryId: 'two', type: 'commit', message: 'feat: other feature' },
          ],
        });
      },
    });
    const head = await git(f.repo, 'rev-parse', 'HEAD');
    const reply = await service.chat({
      repositoryIds: ['one', 'two'],
      prompt: '提交两个仓库，并推送第一个',
      language: 'zh-CN',
      history: [],
      includeStagedDiff: false,
    });
    expect(reply.plan?.status).toBe('ready');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'diff', '--cached')).toBe('');
    expect(sent).not.toContain(f.repo);
    expect(sent).not.toContain('first feature');
    const executed = await service.execute(reply.plan!.id);
    expect(executed.status).toBe('completed');
    expect(executed.steps.every((step) => step.status === 'succeeded')).toBe(true);
    expect(await git(remote, 'rev-parse', 'refs/heads/main')).toBe(
      await git(f.repo, 'rev-parse', 'HEAD'),
    );
    expect(await git(other, 'log', '-1', '--format=%s')).toBe('feat: other feature');
    await expect(service.execute(reply.plan!.id)).rejects.toMatchObject({
      code: 'assistantPlanUsed',
    });
  } finally {
    await f.cleanup();
  }
});

it('支持全新目录，计划提交说明可编辑；停止和过期计划都不会写入', async () => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    await commitFile(f.repo, '.gitattributes', '*.txt text eol=lf\n');
    await mkdir(path.join(f.repo, 'new-folder'));
    await writeFile(path.join(f.repo, 'new-folder', 'new.txt'), 'new feature\r\n');
    const service = new AssistantService({
      repository: async () => ({ id: 'one', name: 'One', path: f.repo }),
      complete: async () =>
        JSON.stringify({
          text: 'Ready',
          operations: [
            { repositoryId: 'one', type: 'stageAll' },
            { repositoryId: 'one', type: 'commit', message: 'original' },
          ],
        }),
    });
    const input = {
      repositoryIds: ['one'],
      prompt: 'commit',
      language: 'en' as const,
      history: [],
      includeStagedDiff: false,
    };
    const first = (await service.chat(input)).plan!;
    service.stop(first.id);
    await expect(service.execute(first.id)).rejects.toMatchObject({ code: 'assistantPlanUsed' });
    const expired = (await service.chat(input)).plan!;
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
    try {
      await expect(service.execute(expired.id)).rejects.toMatchObject({
        code: 'assistantPlanExpired',
      });
    } finally {
      clock.mockRestore();
    }
    const plan = (await service.chat(input)).plan!;
    service.amend(plan.id, { [plan.steps[1].id]: 'feat: reviewed message' });
    const running = service.execute(plan.id);
    await expect(service.execute(plan.id)).rejects.toMatchObject({ code: 'assistantPlanUsed' });
    expect((await running).status).toBe('completed');
    expect(await git(f.repo, 'log', '-1', '--format=%s')).toBe('feat: reviewed message');
    expect(await git(f.repo, 'show', 'HEAD:new-folder/new.txt')).toBe('new feature');
  } finally {
    await f.cleanup();
  }
});

it('拒绝超出范围的模型指令，确认前内容变化或同时执行不会写入', async () => {
  const f = await fixture();
  try {
    const head = await commitFile(f.repo);
    await writeFile(path.join(f.repo, 'draft.txt'), 'version one');
    let output = { text: 'Ready', operations: [{ repositoryId: 'outside', type: 'stageAll' }] };
    const service = new AssistantService({
      repository: async () => ({ id: 'one', name: 'One', path: f.repo }),
      complete: async () => JSON.stringify(output),
    });
    const input = {
      repositoryIds: ['one'],
      prompt: 'commit',
      language: 'en' as const,
      history: [],
      includeStagedDiff: false,
    };
    await expect(service.chat(input)).rejects.toMatchObject({ code: 'assistantOutput' });
    output = { text: 'Ready', operations: [{ repositoryId: 'one', type: 'stageAll' }] };
    const reply = await service.chat(input);
    await writeFile(path.join(f.repo, 'draft.txt'), 'version two');
    const executed = await service.execute(reply.plan!.id);
    expect(executed.status).toBe('failed');
    expect(executed.steps[0].error?.code).toBe('assistantStateChanged');
    expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    expect(await git(f.repo, 'diff', '--cached')).toBe('');
    await expect(service.execute(reply.plan!.id)).rejects.toMatchObject({
      code: 'assistantPlanUsed',
    });
  } finally {
    await f.cleanup();
  }
});

it('提交钩子修改未审阅内容时停止后续操作', async () => {
  const f = await fixture();
  try {
    await commitFile(f.repo);
    const hooks = path.join(f.root, 'hooks');
    await mkdir(hooks);
    const hook = path.join(hooks, 'post-commit');
    await writeFile(hook, '#!/bin/sh\nprintf "hook modified\\n" > reviewed.txt\n');
    await chmod(hook, 0o755);
    await git(f.repo, 'config', 'core.hooksPath', hooks.replaceAll('\\', '/'));
    await writeFile(path.join(f.repo, 'reviewed.txt'), 'reviewed content');
    const service = new AssistantService({
      repository: async () => ({ id: 'one', name: 'One', path: f.repo }),
      complete: async () =>
        JSON.stringify({
          text: 'Ready',
          operations: [
            { repositoryId: 'one', type: 'stageAll' },
            { repositoryId: 'one', type: 'commit', message: 'reviewed' },
          ],
        }),
    });
    const reply = await service.chat({
      repositoryIds: ['one'],
      prompt: 'commit',
      language: 'en',
      history: [],
      includeStagedDiff: false,
    });
    const result = await service.execute(reply.plan!.id);
    expect(result.status).toBe('failed');
    expect(result.steps[1].error?.code).toBe('assistantStateChanged');
    expect(await git(f.repo, 'log', '-1', '--format=%s')).toBe('reviewed');
  } finally {
    await f.cleanup();
  }
});

it('提交期间远端配置被改向时停止计划，不推送到未审阅远端', async () => {
  const f = await fixture();
  try {
    const originalHead = await commitFile(f.repo);
    for (const name of ['reviewed.git', 'unreviewed.git']) {
      await git(f.root, 'init', '--bare', path.join(f.root, name));
      await git(f.repo, 'push', path.join(f.root, name), 'main');
    }
    await git(f.repo, 'remote', 'add', 'origin', path.join(f.root, 'reviewed.git'));
    await git(f.repo, 'fetch', 'origin');
    await git(f.repo, 'branch', '--set-upstream-to=origin/main', 'main');
    const hooks = path.join(f.root, 'hooks');
    await mkdir(hooks);
    await writeFile(
      path.join(hooks, 'post-commit'),
      `#!/bin/sh\ngit remote set-url origin '${path.join(f.root, 'unreviewed.git').replaceAll('\\', '/')}'\n`,
    );
    await chmod(path.join(hooks, 'post-commit'), 0o755);
    await git(f.repo, 'config', 'core.hooksPath', hooks.replaceAll('\\', '/'));
    await writeFile(path.join(f.repo, 'new.txt'), 'reviewed');
    await git(f.repo, 'add', '--', 'new.txt');
    const service = new AssistantService({
      repository: async () => ({ id: 'one', name: 'One', path: f.repo }),
      complete: async () =>
        JSON.stringify({
          text: 'Ready',
          operations: [
            { repositoryId: 'one', type: 'commit', message: 'reviewed' },
            { repositoryId: 'one', type: 'push' },
          ],
        }),
    });
    const reply = await service.chat({
      repositoryIds: ['one'],
      prompt: 'commit and push',
      language: 'en',
      history: [],
      includeStagedDiff: false,
    });
    const result = await service.execute(reply.plan!.id);
    expect(result.status).toBe('failed');
    expect(result.steps[0].error?.code).toBe('assistantStateChanged');
    expect(result.steps[1].status).toBe('skipped');
    expect(await git(path.join(f.root, 'unreviewed.git'), 'rev-parse', 'refs/heads/main')).toBe(
      originalHead,
    );
  } finally {
    await f.cleanup();
  }
});

it.each(['extra-path', 'replaced-blob', 'replaced-mode', 'replaced-type'])(
  '暂存钩子夹带未审阅内容时停止后续提交：%s',
  async (kind) => {
    const f = await fixture();
    try {
      await commitFile(f.repo);
      await commitFile(f.repo, '.gitignore', 'secret.txt\n');
      const head = await git(f.repo, 'rev-parse', 'HEAD');
      await writeFile(path.join(f.repo, 'reviewed.txt'), 'reviewed');
      await git(f.repo, 'config', 'core.filemode', 'false');
      await writeFile(path.join(f.repo, 'secret.txt'), 'unreviewed');
      const hooks = path.join(f.root, 'hooks');
      await mkdir(hooks);
      const hook = path.join(hooks, 'post-index-change');
      const payload = await git(f.repo, 'hash-object', '-w', '--', 'secret.txt');
      await writeFile(
        hook,
        kind === 'extra-path'
          ? '#!/bin/sh\nrm -- "$0"\ngit add -f -- secret.txt\n'
          : kind === 'replaced-mode' || kind === 'replaced-type'
            ? `#!/bin/sh\nrm -- "$0"\nblob=$(git hash-object -- reviewed.txt)\ngit update-index --cacheinfo ${kind === 'replaced-mode' ? '100755' : '120000'},$blob,reviewed.txt\ngit update-index --assume-unchanged -- reviewed.txt\n`
            : `#!/bin/sh\nrm -- "$0"\ngit update-index --cacheinfo 100644,${payload},reviewed.txt\ngit update-index --assume-unchanged -- reviewed.txt\n`,
      );
      await chmod(hook, 0o755);
      await git(f.repo, 'config', 'core.hooksPath', hooks.replaceAll('\\', '/'));
      const service = new AssistantService({
        repository: async () => ({ id: 'one', name: 'One', path: f.repo }),
        complete: async () =>
          JSON.stringify({
            text: 'Ready',
            operations: [
              { repositoryId: 'one', type: 'stageAll' },
              { repositoryId: 'one', type: 'commit', message: 'reviewed' },
            ],
          }),
      });
      const reply = await service.chat({
        repositoryIds: ['one'],
        prompt: 'commit',
        language: 'en',
        history: [],
        includeStagedDiff: false,
      });
      expect(reply.plan!.steps[0].fileCount).toBe(1);
      const result = await service.execute(reply.plan!.id);
      expect(result.status).toBe('failed');
      expect(result.steps[0].error?.code).toBe('assistantStateChanged');
      expect(result.steps[1].status).toBe('skipped');
      expect(await git(f.repo, 'rev-parse', 'HEAD')).toBe(head);
    } finally {
      await f.cleanup();
    }
  },
);
