import { describe, expect, it, vi } from 'vitest';
import { createAnimationFrameBatch } from '../src/lib/animation-frame-batch';

function createFrames() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    request: (callback: FrameRequestCallback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancel: (id: number) => callbacks.delete(id),
    runNext: () => {
      const entry = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!entry) return;
      callbacks.delete(entry[0]);
      entry[1](0);
    },
    get size() {
      return callbacks.size;
    },
  };
}

describe('动画帧批处理', () => {
  it('同一帧内多次调度只运行一次', () => {
    const frames = createFrames();
    const update = vi.fn();
    const batch = createAnimationFrameBatch(update, frames.request, frames.cancel);

    batch.schedule();
    batch.schedule();
    batch.schedule();

    expect(frames.size).toBe(1);
    frames.runNext();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('立即刷新时取消排队帧并同步运行一次', () => {
    const frames = createFrames();
    const update = vi.fn();
    const batch = createAnimationFrameBatch(update, frames.request, frames.cancel);

    batch.schedule();
    batch.flush();

    expect(update).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    frames.runNext();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('取消时丢弃排队更新', () => {
    const frames = createFrames();
    const update = vi.fn();
    const batch = createAnimationFrameBatch(update, frames.request, frames.cancel);

    batch.schedule();
    batch.cancel();
    frames.runNext();

    expect(update).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
