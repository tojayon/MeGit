import { afterEach, expect, it } from 'vitest';
import path from 'node:path';
import { fixture, commitFile, git } from './fixtures';
import { readIntegrationHistory } from '../server/integration-history';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup() {
  const f = await fixture();
  cleanups.push(f.cleanup);
  const base = await commitFile(f.repo);
  const target = path.join(f.root, 'server');
  await git(f.root, 'clone', f.repo, target);
  await git(target, 'config', 'user.name', 'MeGit');
  await git(target, 'config', 'user.email', 'test@example.invalid');
  return { ...f, target, base };
}
it('待整合以共同祖先展示双方独有提交，目标独有提交不加入待整合计数', async () => {
  const f = await setup();
  const sourceTip = await commitFile(f.repo, 'public.txt', 'public');
  const targetTip = await commitFile(f.target, 'server.txt', 'private');
  await git(f.target, 'fetch', 'origin');
  const detail = await readIntegrationHistory(
    f.repo,
    f.target,
    'refs/heads/main',
    'refs/heads/main',
  );
  expect(detail.comparison.state).toBe('pending');
  expect(detail.comparison.pending).toBe(1);
  expect(detail.commonBases.map((c) => c.hash)).toEqual([f.base]);
  expect(detail.sourceOnly.commits.map((c) => c.hash)).toEqual([sourceTip]);
  expect(detail.targetOnly.commits.map((c) => c.hash)).toEqual([targetTip]);
  expect(detail.sourceTip?.subject).toBe('测试提交');
  expect(detail.includedAt).toBeNull();
});
it('已整合定位首次包含来源的主线提交，不将当前目标提交冒充合并提交', async () => {
  const f = await setup();
  await commitFile(f.target, 'server.txt', 'private');
  const sourceTip = await commitFile(f.repo, 'public.txt', 'public');
  await git(f.target, 'fetch', 'origin');
  await git(f.target, 'merge', '--no-ff', 'origin/main', '-m', '整合公共更新');
  const merge = await git(f.target, 'rev-parse', 'HEAD');
  const targetTip = await commitFile(f.target, 'later.txt', 'later');
  const detail = await readIntegrationHistory(f.repo, f.target, 'main', 'main');
  expect(detail.comparison.state).toBe('integrated');
  expect(detail.sourceTip?.hash).toBe(sourceTip);
  expect(detail.includedAt?.hash).toBe(merge);
  expect(detail.includedAt?.subject).toBe('整合公共更新');
  expect(detail.targetTip?.hash).toBe(targetTip);
  expect(detail.targetOnly.total).toBe(2);
  expect(detail.targetOnly.commits.map((c) => c.hash)).toEqual([targetTip, merge]);
});
it('局部关系只显示 C、D、M、T，排除共同版本 C 之前分出的服务器开发', async () => {
  const f = await setup();
  const s = await commitFile(f.target, 'server.txt', 'private before C');
  const c = await commitFile(f.repo, 'public.txt', 'C');
  await git(f.target, 'fetch', 'origin');
  await git(f.target, 'merge', '--no-ff', 'origin/main', '-m', 'M');
  const m = await git(f.target, 'rev-parse', 'HEAD');
  const t = await commitFile(f.target, 'later.txt', 'T');
  const d = await commitFile(f.repo, 'public.txt', 'D');
  await git(f.target, 'fetch', 'origin');
  const detail = await readIntegrationHistory(f.repo, f.target, 'main', 'main');
  expect(detail.commonBases.map((commit) => commit.hash)).toEqual([c]);
  expect(detail.sourceOnly.commits.map((commit) => commit.hash)).toEqual([d]);
  expect(detail.targetOnly.commits.map((commit) => commit.hash)).toEqual([t, m]);
  expect(detail.targetOnly.total).toBe(2);
  expect(detail.comparison.pending).toBe(1);
  expect(detail.targetOnly.commits.some((commit) => commit.hash === s)).toBe(false);
  const page = await readIntegrationHistory(f.repo, f.target, 'main', 'main', {
    offset: 1,
    limit: 1,
    sourceHash: d,
    targetHash: t,
  });
  expect(page.targetOnly.commits.map((commit) => commit.hash)).toEqual([m]);
  expect(page.targetOnly.hasMore).toBe(false);
});
it('多个最佳共同祖先均作为局部边界，不任取一个或重复列出共同历史', async () => {
  const f = await setup();
  const a = await commitFile(f.repo, 'a.txt', 'A');
  const b = await commitFile(f.target, 'b.txt', 'B');
  await git(f.target, 'fetch', 'origin');
  const tree = await git(f.target, 'rev-parse', 'HEAD^{tree}');
  const left = await git(f.target, 'commit-tree', tree, '-p', a, '-p', b, '-m', 'Left merge');
  const right = await git(f.target, 'commit-tree', tree, '-p', b, '-p', a, '-m', 'Right merge');
  await git(f.target, 'update-ref', 'refs/heads/main', right);
  await git(f.repo, 'fetch', f.target, right);
  await git(f.repo, 'fetch', f.target, left);
  await git(f.repo, 'update-ref', 'refs/heads/main', left);
  const detail = await readIntegrationHistory(f.repo, f.target, 'main', 'main');
  expect(detail.commonBases.map((commit) => commit.hash).sort()).toEqual([a, b].sort());
  expect(detail.sourceOnly.commits.map((commit) => commit.hash)).toEqual([left]);
  expect(detail.targetOnly.commits.map((commit) => commit.hash)).toEqual([right]);
  expect(detail.sourceOnly.total).toBe(1);
  expect(detail.targetOnly.total).toBe(1);
});
it('快进／相同提交不虚构合并事件，分页使用固定快照且检测分支变化', async () => {
  const f = await setup();
  const sourceTip = await commitFile(f.repo, 'a.txt', 'public');
  await git(f.target, 'fetch', 'origin');
  await git(f.target, 'merge', '--ff-only', 'origin/main');
  const equal = await readIntegrationHistory(f.repo, f.target, 'main', 'main');
  expect(equal.includedAt?.hash).toBe(sourceTip);
  expect(equal.includedAt?.parents).toHaveLength(1);
  await commitFile(f.repo, 'b.txt', 'new');
  await git(f.target, 'fetch', 'origin');
  const limited = await readIntegrationHistory(f.repo, f.target, 'main', 'main', { limit: 1 });
  expect(limited.sourceOnly.total).toBe(1);
  await commitFile(f.repo, 'c.txt', 'newer');
  await git(f.target, 'fetch', 'origin');
  const first = await readIntegrationHistory(f.repo, f.target, 'main', 'main', { limit: 1 });
  expect(first.sourceOnly.total).toBe(2);
  expect(first.sourceOnly.hasMore).toBe(true);
  const second = await readIntegrationHistory(f.repo, f.target, 'main', 'main', {
    limit: 1,
    offset: 1,
    sourceHash: first.comparison.sourceHead!,
    targetHash: first.comparison.targetHead!,
  });
  expect(second.sourceOnly.commits).toHaveLength(1);
  expect(second.sourceOnly.hasMore).toBe(false);
  expect(second.sourceOnly.commits[0].hash).not.toBe(first.sourceOnly.commits[0].hash);
  await expect(
    readIntegrationHistory(f.repo, f.target, 'main', 'main', {
      sourceHash: sourceTip,
      targetHash: sourceTip,
    }),
  ).rejects.toMatchObject({ code: 'branchTargetChanged' });
});
it('缺少对象时保留真实两端提交，不生成不存在的共同历史', async () => {
  const f = await setup();
  const sourceTip = await commitFile(f.repo, 'new.txt', 'new');
  const detail = await readIntegrationHistory(f.repo, f.target, 'main', 'main');
  expect(detail.comparison.messageCode).toBe('missingObjects');
  expect(detail.sourceTip?.hash).toBe(sourceTip);
  expect(detail.targetTip?.hash).toBe(f.base);
  expect(detail.commonBases).toEqual([]);
  expect(detail.sourceOnly.total).toBeNull();
});
