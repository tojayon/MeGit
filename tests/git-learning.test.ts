import { describe, expect, it } from 'vitest';
import { gitLessons, learningLessonIds } from '../src/lib/git-learning';
import { clampDialogOffset } from '../src/lib/dialog-position';

describe('Git 教学场景保持真实语义', () => {
  it('暂存后继续修改不会改变暂存快照，提交后工作区仍保留后续修改', () => {
    const steps = gitLessons.basics.steps;
    expect(steps[2].frame).toMatchObject({ working: 2, index: 1 });
    expect(steps[3].frame).toMatchObject({ working: 2, index: 1, main: 'C1' });
    expect(steps[3].frame.commits.find((commit) => commit.id === 'C1')?.version).toBe(1);
    expect(steps[4].frame.commits.map((commit) => commit.id)).toEqual(['C1']);
    expect(steps[5].frame).toMatchObject({ working: 2, index: 2, main: 'C2' });
  });
  it('创建和切换分支不创建提交，HEAD 跟随所选分支并恢复对应快照', () => {
    const steps = gitLessons.branches.steps;
    expect(steps[1].frame.commits).toEqual(steps[0].frame.commits);
    expect(steps[2].frame).toMatchObject({ head: 'feature', working: 2, feature: 'C2' });
    expect(steps[4].frame).toMatchObject({ head: 'main', main: 'C2', feature: 'C3', working: 2 });
    expect(steps[4].frame.commits).toEqual(steps[3].frame.commits);
  });
  it('分叉后的合并提交保留两个父提交以及原分支', () => {
    const frame = gitLessons.merge.steps.at(-1)!.frame;
    expect(frame.commits.find((commit) => commit.id === frame.main)?.parents).toEqual(['C4', 'C3']);
    expect(frame.feature).toBe('C3');
  });
  it('自动合并只组合不同文件的独立改动，不凭空改写同一行', () => {
    const steps = gitLessons.merge.steps;
    const files = (index: number) => {
      const frame = steps[index].frame;
      const target = frame.head === 'main' ? frame.main : frame.feature;
      return frame.commits.find((commit) => commit.id === target)?.files;
    };
    expect(files(0)).toEqual({ 'README.md': 2, 'app.ts': 1 });
    expect(files(1)).toEqual({ 'README.md': 2, 'app.ts': 2 });
    expect(files(2)).toEqual({ 'README.md': 3, 'app.ts': 1 });
    expect(files(3)).toEqual({ 'README.md': 3, 'app.ts': 2 });
  });
  it('fetch 仅更新远端跟踪引用，快进后才改变本地 main，push 后远端同步', () => {
    const steps = gitLessons.remote.steps;
    expect(steps[2].frame).toMatchObject({ main: 'C1', tracking: 'C2', remote: 'C2', working: 1 });
    expect(steps[3].frame).toMatchObject({ main: 'C2', tracking: 'C2', working: 2 });
    expect(steps[4].frame).toMatchObject({ main: 'C3', tracking: 'C2', remote: 'C2' });
    expect(steps[5].frame).toMatchObject({ main: 'C3', tracking: 'C3', remote: 'C3' });
  });
  it('取消暂存保留工作区修改，revert 新增提交而不抹去原提交', () => {
    const steps = gitLessons.undo.steps;
    expect(steps[1].frame).toMatchObject({ working: 3, index: 2 });
    expect(steps[2].frame).toMatchObject({ working: 2, index: 2 });
    expect(steps[3].frame.commits.map((commit) => commit.id)).toEqual(['C1', 'C2', 'C3']);
    expect(steps[3].frame.commits.at(-1)).toMatchObject({ parents: ['C2'], version: 1 });
  });
  it('冲突未解决或只编辑文件时，不提前创建合并提交', () => {
    const steps = gitLessons.conflicts.steps;
    expect(steps[1].frame).toMatchObject({ conflict: 'unresolved', main: 'C4' });
    expect(steps[2].frame).toMatchObject({ conflict: 'resolved', index: null, main: 'C4' });
    expect(steps[3].frame).toMatchObject({ conflict: 'staged', index: 5, main: 'C4' });
    expect(steps[4].frame.commits.at(-1)?.parents).toEqual(['C4', 'C3']);
  });
  it('所有图中的提交父节点、分支和 HEAD 引用完整且无循环', () => {
    expect(learningLessonIds).toHaveLength(7);
    for (const id of learningLessonIds) {
      for (const { frame } of gitLessons[id].steps) {
        const seen = new Set<string>();
        for (const commit of frame.commits) {
          expect(seen.has(commit.id)).toBe(false);
          for (const parent of commit.parents) expect(seen.has(parent)).toBe(true);
          seen.add(commit.id);
        }
        for (const ref of [frame.main, frame.feature, frame.tracking, frame.remote])
          if (ref) expect(seen.has(ref)).toBe(true);
        if (frame.head === 'feature') expect(frame.feature).toBeTruthy();
      }
    }
  });
});

describe('可拖动学习窗口', () => {
  const box = { left: 200, top: 100, width: 900, height: 600 };
  it('保持原偏移并将窗口限制在视口内', () => {
    expect(clampDialogOffset({ x: 50, y: 20 }, box, { width: 1400, height: 900 })).toEqual({
      x: 50,
      y: 20,
    });
    expect(clampDialogOffset({ x: -1000, y: 1000 }, box, { width: 1400, height: 900 })).toEqual({
      x: -192,
      y: 192,
    });
  });
  it('窗口大于可用视口时仍保留标题栏与关闭入口', () => {
    expect(
      clampDialogOffset(
        { x: 200, y: 400 },
        { left: 0, top: 0, width: 400, height: 800 },
        { width: 390, height: 600 },
      ),
    ).toEqual({ x: -18, y: 8 });
  });
});
