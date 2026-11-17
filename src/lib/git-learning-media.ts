import {
  gitLessons,
  type LearningLesson,
  type LearningLessonId,
  type LearningStep,
} from './git-learning';

type DemoSource = { lesson: LearningLessonId; frames: readonly LearningStep['caption'][] };

// Semantic frame names keep consumers independent of course ordering.
export const gitLearningDemos = {
  stage: { lesson: 'basics', frames: ['init', 'stageCopy'] },
  commit: { lesson: 'basics', frames: ['editAfterStage', 'commitStaged'] },
  unstage: { lesson: 'undo', frames: ['undoStart', 'unstage'] },
  discard: { lesson: 'undo', frames: ['unstage', 'discard'] },
  revert: { lesson: 'undo', frames: ['discard', 'revert'] },
  createBranch: { lesson: 'branches', frames: ['branchPointer', 'branchCreate'] },
  switchBranch: { lesson: 'branches', frames: ['branchCommit', 'branchReturn'] },
  merge: { lesson: 'merge', frames: ['mergeDiverged', 'mergeParents'] },
  clone: { lesson: 'remote', frames: ['clone'] },
  fetch: { lesson: 'remote', frames: ['peerCommit', 'fetchOnly'] },
  pull: { lesson: 'remote', frames: ['peerCommit', 'fetchOnly', 'fastForward'] },
  push: { lesson: 'remote', frames: ['localCommit', 'push'] },
  resolveConflict: {
    lesson: 'conflicts',
    frames: ['conflictPause', 'conflictResolve', 'conflictStage', 'conflictCommit'],
  },
  snapshot: {
    lesson: 'snapshots',
    frames: ['snapshotWhole', 'snapshotChanged', 'snapshotShared', 'snapshotHistory'],
  },
} as const satisfies Record<string, DemoSource>;

export type GitLearningDemoId = keyof typeof gitLearningDemos;
export type GitLearningPlayback = 'animated' | 'still';
export type LearningDemoOptions = {
  learningDemo?: GitLearningDemoId;
  learningPlayback?: GitLearningPlayback;
};
export const gitLearningDemoIds = Object.keys(gitLearningDemos) as GitLearningDemoId[];

export type GitLearningDemo = {
  id: GitLearningDemoId;
  lessonId: LearningLessonId;
  lesson: LearningLesson;
  steps: readonly LearningStep[];
};

export function getGitLearningDemo(id: GitLearningDemoId): GitLearningDemo {
  const source = gitLearningDemos[id];
  const lesson = gitLessons[source.lesson];
  const steps = source.frames.map((caption) => {
    const frame = lesson.steps.find((step) => step.caption === caption);
    if (!frame) throw new Error(`Missing learning frame: ${source.lesson}/${caption}`);
    return frame;
  });
  return { id, lessonId: source.lesson, lesson, steps };
}
