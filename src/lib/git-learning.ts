import type learning from '../i18n/locales/learning-zh-CN';

export const learningLessonIds = [
  'basics',
  'snapshots',
  'branches',
  'merge',
  'remote',
  'undo',
  'conflicts',
] as const;
export type LearningLessonId = (typeof learningLessonIds)[number];
export type LearningCommit = {
  id: string;
  parents: readonly string[];
  version: number;
  lane: 0 | 1;
  files?: Readonly<Record<string, number>>;
};
export type LearningFrame = {
  commits: readonly LearningCommit[];
  main: string | null;
  feature: string | null;
  head: 'main' | 'feature';
  working: number;
  index: number | null;
  tracking: string | null;
  remote: string | null;
  conflict: 'unresolved' | 'resolved' | 'staged' | null;
  inspected: string | null;
};
export type LearningStep = {
  caption: keyof typeof learning.captions;
  action: keyof typeof learning.actions;
  command: string | null;
  frame: LearningFrame;
};
export type LearningLesson = {
  view: 'areas' | 'snapshots' | 'graph' | 'remote' | 'conflict';
  steps: readonly LearningStep[];
};

const c1: LearningCommit = { id: 'C1', parents: [], version: 1, lane: 0 };
const c2: LearningCommit = { id: 'C2', parents: ['C1'], version: 2, lane: 0 };
const c3: LearningCommit = { id: 'C3', parents: ['C2'], version: 3, lane: 1 };
const c4: LearningCommit = { id: 'C4', parents: ['C2'], version: 4, lane: 0 };
const c5: LearningCommit = { id: 'C5', parents: ['C4', 'C3'], version: 5, lane: 0 };
const base = [c1, c2];
const fork = [...base, c3, c4];
const joined = [...fork, c5];
const linear3: LearningCommit = { id: 'C3', parents: ['C2'], version: 3, lane: 0 };
// The automatic merge changes separate files. The conflict lesson intentionally
// edits the same README line on both branches instead.
const mergeBase = [
  { ...c1, files: { 'README.md': 1, 'app.ts': 1 } },
  { ...c2, files: { 'README.md': 2, 'app.ts': 1 } },
];
const mergeFeature = { ...c3, files: { 'README.md': 2, 'app.ts': 2 } };
const mergeMain = { ...c4, files: { 'README.md': 3, 'app.ts': 1 } };
const mergeResult = { ...c5, files: { 'README.md': 3, 'app.ts': 2 } };

function frame(patch: Partial<LearningFrame> = {}): LearningFrame {
  return {
    commits: base,
    main: 'C2',
    feature: null,
    head: 'main',
    working: 2,
    index: 2,
    tracking: null,
    remote: null,
    conflict: null,
    inspected: null,
    ...patch,
  };
}
function step(
  caption: LearningStep['caption'],
  action: LearningStep['action'],
  command: string | null,
  patch: Partial<LearningFrame> = {},
): LearningStep {
  return { caption, action, command, frame: frame(patch) };
}

// Immutable, fictional snapshots. This module has no transport or Git dependency.
export const gitLessons: Record<LearningLessonId, LearningLesson> = {
  basics: {
    view: 'areas',
    steps: [
      step('init', 'start', 'git init -b main', {
        commits: [],
        main: null,
        working: 1,
        index: null,
      }),
      step('stageCopy', 'stage', 'git add README.md', {
        commits: [],
        main: null,
        working: 1,
        index: 1,
      }),
      step('editAfterStage', 'edit', null, { commits: [], main: null, working: 2, index: 1 }),
      step('commitStaged', 'commit', 'git commit -m "v1"', {
        commits: [c1],
        main: 'C1',
        working: 2,
        index: 1,
      }),
      step('stageAgain', 'stage', 'git add README.md', { commits: [c1], main: 'C1' }),
      step('commitAgain', 'commit', 'git commit -m "v2"'),
    ],
  },
  snapshots: {
    view: 'snapshots',
    steps: [
      step('snapshotWhole', 'inspect', 'git ls-tree -r C1', { inspected: 'C1' }),
      step('snapshotChanged', 'inspect', 'git ls-tree -r C2', { inspected: 'C2' }),
      step('snapshotShared', 'inspect', 'git diff C1 C2', { inspected: 'C2' }),
      step('snapshotHistory', 'inspect', 'git log --oneline', { inspected: 'C1' }),
    ],
  },
  branches: {
    view: 'graph',
    steps: [
      step('branchPointer', 'start', 'git branch'),
      step('branchCreate', 'branch', 'git branch feature', { feature: 'C2' }),
      step('branchSwitch', 'switchFeature', 'git switch feature', {
        feature: 'C2',
        head: 'feature',
      }),
      step('branchCommit', 'commit', 'git commit -am "feature"', {
        commits: [...base, c3],
        feature: 'C3',
        head: 'feature',
        working: 3,
        index: 3,
      }),
      step('branchReturn', 'switchMain', 'git switch main', {
        commits: [...base, c3],
        feature: 'C3',
      }),
    ],
  },
  merge: {
    view: 'graph',
    steps: [
      step('mergeBase', 'start', null, { commits: mergeBase, feature: 'C2' }),
      step('mergeFeature', 'commit', 'git switch feature && git commit -am "feature"', {
        commits: [...mergeBase, mergeFeature],
        feature: 'C3',
        head: 'feature',
        working: 3,
        index: 3,
      }),
      step('mergeDiverged', 'commitMain', 'git switch main && git commit -am "main"', {
        commits: [...mergeBase, mergeFeature, mergeMain],
        main: 'C4',
        feature: 'C3',
        working: 4,
        index: 4,
      }),
      step('mergeParents', 'merge', 'git merge feature', {
        commits: [...mergeBase, mergeFeature, mergeMain, mergeResult],
        main: 'C5',
        feature: 'C3',
        working: 5,
        index: 5,
      }),
    ],
  },
  remote: {
    view: 'remote',
    steps: [
      step('clone', 'start', 'git clone <url>', {
        commits: [c1],
        main: 'C1',
        tracking: 'C1',
        remote: 'C1',
        working: 1,
        index: 1,
      }),
      step('peerCommit', 'peer', null, {
        main: 'C1',
        tracking: 'C1',
        remote: 'C2',
        working: 1,
        index: 1,
      }),
      step('fetchOnly', 'fetch', 'git fetch origin', {
        main: 'C1',
        tracking: 'C2',
        remote: 'C2',
        working: 1,
        index: 1,
      }),
      step('fastForward', 'fastForward', 'git merge --ff-only origin/main', {
        tracking: 'C2',
        remote: 'C2',
      }),
      step('localCommit', 'commit', 'git commit -am "local"', {
        commits: [...base, linear3],
        main: 'C3',
        tracking: 'C2',
        remote: 'C2',
        working: 3,
        index: 3,
      }),
      step('push', 'push', 'git push origin main', {
        commits: [...base, linear3],
        main: 'C3',
        tracking: 'C3',
        remote: 'C3',
        working: 3,
        index: 3,
      }),
    ],
  },
  undo: {
    view: 'areas',
    steps: [
      step('undoStart', 'start', 'git status', { working: 3, index: 3 }),
      step('unstage', 'unstage', 'git restore --staged README.md', { working: 3 }),
      step('discard', 'discard', 'git restore README.md'),
      step('revert', 'revert', 'git revert C2', {
        commits: [...base, { id: 'C3', parents: ['C2'], version: 1, lane: 0 }],
        main: 'C3',
        working: 1,
        index: 1,
      }),
    ],
  },
  conflicts: {
    view: 'conflict',
    steps: [
      step('conflictStart', 'start', null, {
        commits: fork,
        main: 'C4',
        feature: 'C3',
        working: 4,
        index: 4,
      }),
      step('conflictPause', 'merge', 'git merge feature', {
        commits: fork,
        main: 'C4',
        feature: 'C3',
        working: 4,
        index: null,
        conflict: 'unresolved',
      }),
      step('conflictResolve', 'resolve', null, {
        commits: fork,
        main: 'C4',
        feature: 'C3',
        working: 5,
        index: null,
        conflict: 'resolved',
      }),
      step('conflictStage', 'stage', 'git add README.md', {
        commits: fork,
        main: 'C4',
        feature: 'C3',
        working: 5,
        index: 5,
        conflict: 'staged',
      }),
      step('conflictCommit', 'commit', 'git commit -m "resolve"', {
        commits: joined,
        main: 'C5',
        feature: 'C3',
        working: 5,
        index: 5,
      }),
    ],
  },
};
