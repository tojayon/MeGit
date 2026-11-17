import { expect, it } from 'vitest';
import { createRefreshQueue } from '../src/lib/refresh-queue.js';

it('将并发刷新合并为串行批次，操作后的调用等待最新一批完成', async () => {
  const releases: Array<() => void> = [];
  const seen: number[] = [];
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const refresh = createRefreshQueue(async () => {
    const call = ++calls;
    maxActive = Math.max(maxActive, ++active);
    await new Promise<void>((resolve) => releases.push(resolve));
    seen.push(call);
    active--;
  });
  const first = refresh();
  let firstCompleted = false;
  void first.then(() => {
    firstCompleted = true;
  });
  const second = refresh();
  const third = refresh();
  await Promise.resolve();
  expect(calls).toBe(1);
  releases.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toBe(2);
  const completedBeforeQueueIsIdle = firstCompleted;
  releases.shift()!();
  await Promise.all([first, second, third]);
  expect(maxActive).toBe(1);
  expect(seen).toEqual([1, 2]);
  expect(completedBeforeQueueIsIdle).toBe(true);
});
