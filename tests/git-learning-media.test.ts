import { describe, expect, it } from 'vitest';
import { gitLessons } from '../src/lib/git-learning';
import { getGitLearningDemo, gitLearningDemoIds } from '../src/lib/git-learning-media';

describe('可复用的 Git 演示素材', () => {
  it('暂存素材直接引用课堂快照，保留工作文件而复制到暂存区', () => {
    const demo = getGitLearningDemo('stage');
    expect(demo.steps[0]).toBe(gitLessons.basics.steps[0]);
    expect(demo.steps[1]).toBe(gitLessons.basics.steps[1]);
    expect(demo.steps.map((step) => [step.frame.working, step.frame.index])).toEqual([
      [1, null],
      [1, 1],
    ]);
  });
  it('提交素材记录已暂存版本，工作区的后续修改继续保留', () => {
    const demo = getGitLearningDemo('commit');
    expect(demo.steps.at(-1)?.frame).toMatchObject({ working: 2, index: 1, main: 'C1' });
  });
  it('获取只更新缓存，拉取展示获取后快进整合，推送才更新远端', () => {
    const fetch = getGitLearningDemo('fetch');
    expect(fetch.steps.map((step) => step.frame.main)).toEqual(['C1', 'C1']);
    expect(fetch.steps.map((step) => step.frame.tracking)).toEqual(['C1', 'C2']);
    const pull = getGitLearningDemo('pull');
    expect(pull.steps.map((step) => [step.frame.main, step.frame.tracking])).toEqual([
      ['C1', 'C1'],
      ['C1', 'C2'],
      ['C2', 'C2'],
    ]);
    expect(getGitLearningDemo('push').steps.map((step) => step.frame.remote)).toEqual(['C2', 'C3']);
  });
  it('切换分支素材恢复对应工作文件，不产生新提交', () => {
    const demo = getGitLearningDemo('switchBranch');
    expect(demo.steps[0].frame.head).toBe('feature');
    expect(demo.steps[1].frame).toMatchObject({ head: 'main', working: 2 });
    expect(demo.steps[1].frame.commits).toEqual(demo.steps[0].frame.commits);
  });
  it('每份素材有明确起止且完全来自课堂，不靠易漂移的数字下标选帧', () => {
    expect(gitLearningDemoIds).toHaveLength(14);
    for (const id of gitLearningDemoIds) {
      const demo = getGitLearningDemo(id);
      expect(demo.steps.length).toBeGreaterThan(0);
      expect(demo.steps.length).toBeLessThanOrEqual(4);
      for (const step of demo.steps) expect(demo.lesson.steps).toContain(step);
      expect(new Set(demo.steps.map((step) => step.caption)).size).toBe(demo.steps.length);
    }
  });
});
