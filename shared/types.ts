import type { ErrorInfo, IntegrationMessage } from './messages.js';
export type RelationKind = 'integration' | 'dependency' | 'delivery';
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeRouting = 'smoothstep' | 'step' | 'bezier' | 'straight';
export interface Repository {
  id: string;
  name: string;
  path: string;
  logoPath?: string;
  archived?: boolean;
}
export interface RepositoryImage {
  path: string;
  dataUrl: string;
}
export interface RepositoryImages {
  directory: string;
  entries: { name: string; path: string; kind: 'directory' | 'image' }[];
  hasMore: boolean;
}
export interface FlowNode {
  id: string;
  repoId: string;
  ref?: string;
  displayName?: string;
  position: { x: number; y: number };
}
export interface FlowNote {
  id: string;
  title: string;
  text: string;
  kind?: 'note' | 'process' | 'decision' | 'start' | 'end';
  summary?: string;
  position: { x: number; y: number };
}
export interface FlowConnection {
  id: string;
  source: string;
  target: string;
  label: string;
  sourcePort?: PortSide;
  targetPort?: PortSide;
  waypoints?: { x: number; y: number }[];
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind: RelationKind;
  label: string;
  sourceRef?: string;
  targetRef?: string;
  localIntegration?: boolean;
  localMerge?: boolean;
  routing?: EdgeRouting;
  waypoints?: { x: number; y: number }[];
  sourcePort?: PortSide;
  targetPort?: PortSide;
}
export interface FlowGroup {
  id: string;
  name: string;
  nodeIds: string[];
  collapsed: boolean;
}
export interface Board {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups?: FlowGroup[];
  notes?: FlowNote[];
  connections?: FlowConnection[];
  layoutLocked?: boolean;
  viewport?: { x: number; y: number; zoom: number };
}
export interface Workspace {
  version: 1;
  revision: number;
  activeBoardId: string;
  repositories: Repository[];
  boards: Board[];
}
export interface ChangedFile {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  untracked: boolean;
  conflicted: boolean;
}
export interface Branch {
  name: string;
  current: boolean;
  remote: boolean;
  hash: string;
  inWorktree?: boolean;
}
export interface RepoState {
  branch: string;
  head: string | null;
  detached: boolean;
  upstream: string | null;
  upstreamRef?: string | null;
  trackingConfigured?: boolean;
  pushTarget?: { remote: string; ref: string } | null;
  upstreamHead?: string | null;
  ahead: number | null;
  behind: number | null;
  changed: number;
  staged: number;
  files: ChangedFile[];
  branches: Branch[];
  remotes: string[];
  fetchedAt: string | null;
  checkedAt: string;
  error?: string;
  errorInfo?: ErrorInfo;
  operation?: 'merge' | 'rebase' | 'cherryPick' | 'revert' | 'bisect' | 'sequencer';
}
export interface Commit {
  rootUnconfirmed?: boolean;
  hash: string;
  shortHash: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  refs: string;
}
export type RemoteDestination = { kind: 'web' | 'local'; value: string };

export interface TreeBranch extends Branch {
  ref: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  upstream: string | null;
  upstreamGone: boolean;
  ahead: number | null;
  behind: number | null;
  worktreePath?: string;
  remoteDestination?: RemoteDestination;
}
export interface BranchTreeData {
  baseRef: string | null;
  head: string | null;
  currentRef: string | null;
  detached: boolean;
  branches: TreeBranch[];
  commits: Commit[];
  hasMore: boolean;
  limit: number;
  shallow: boolean;
  checkedAt: string;
}
export interface BranchComparison {
  sourceRef: string;
  targetRef: string;
  sourceHash: string;
  targetHash: string;
  sourceOnly: number;
  targetOnly: number;
  sourceCommits: string[];
  targetCommits: string[];
  mergeBases: string[];
  relation: 'same' | 'included' | 'ahead' | 'diverged' | 'unrelated' | 'unknown';
  checkedAt: string;
}
export interface DiffQuery {
  path?: string;
  staged?: boolean;
  commit?: string;
}
export interface DiffResult {
  text: string;
  truncated: boolean;
  notice?: 'binary' | 'untrackedDirectory';
}
export type BranchExpectation = Pick<RepoState, 'branch' | 'head' | 'detached'>;
export type BranchAction =
  | {
      type: 'createBranch';
      name: string;
      // HEAD, a full branch ref, or COMMIT with a verified complete startHash.
      startPoint: string;
      startHash: string;
      checkout: boolean;
      track: boolean;
      expected: BranchExpectation;
    }
  | {
      type: 'switchBranch' | 'deleteBranch';
      name: string;
      targetHash: string;
      expected: BranchExpectation;
    };
export type ProxySettings = { enabled: boolean; address: string };

export type RemoteReadStatus =
  | 'readable'
  | 'proxyConnection'
  | 'proxyTimeout'
  | 'proxyUnsupported'
  | 'remoteNotConfigured'
  | 'remoteDestinationCredentials'
  | 'remoteReadAuth'
  | 'remoteReadNetwork'
  | 'remoteReadLocal'
  | 'remoteReadUnknown'
  | 'gitTimeout'
  | 'gitMissing';

export type RemoteAction =
  | { type: 'addRemote'; name: string; destination: string }
  | { type: 'publishBranch'; remote: string; name: string; expected: BranchExpectation }
  | { type: 'setTracking'; targetRef: string; targetHash: string; expected: BranchExpectation };
export type SyncAction = {
  type: 'pull' | 'push';
  expected?: { branch: string; head: string; remote: string; ref: string; upstreamHead: string };
};
export type GitAction =
  | BranchAction
  | RemoteAction
  | { type: 'stage' | 'unstage'; paths: string[] }
  | { type: 'commit'; message: string }
  | { type: 'fetch' }
  | { type: 'fetchRemote'; remote: string }
  | SyncAction;
export interface RelationAction {
  type: 'pull' | 'push' | 'integrate';
  source: string;
  target: string;
  sourceRepo: string;
  targetRepo: string;
  sourceRef: string;
  targetRef: string;
  sourceHead: string;
  targetHead: string;
}
export type RelationMergeSelection = Omit<RelationAction, 'type'>;

export type RelationMergeRequest = RelationMergeSelection & (
  | { step: 'review' }
  | { step: 'prepare' }
  | { step: 'abort'; session: string }
  | { step: 'commit'; session: string; index: string; message: string }
);

export type RelationMergeResult =
  | {
      phase: 'review';
      reviewKey: string;
      sourceTotal: number;
      targetTotal: number;
      sourceCommits: { hash: string; subject: string }[];
      targetCommits: { hash: string; subject: string }[];
      diff: DiffResult | null;
      blocked?: 'branchOperation' | 'dirtyPull';
    }
  | {
      phase: 'pending';
      reviewKey: string;
      session: string;
      sourceHead: string;
      sourceRef: string;
      index: string;
      conflicts: string[];
      ready: boolean;
      diff: DiffResult;
    }
  | { phase: 'committed' | 'aborted'; state: RepoState };
export type RelationMergeView = Extract<RelationMergeResult, { phase: 'review' | 'pending' }>;
export type RelationMergeAdvice = { text: string; message: string | null };
export interface IntegrationState {
  state: 'integrated' | 'pending' | 'unknown';
  sourceHead: string | null;
  targetHead: string | null;
  pending: number | null;
  divergence?: { targetAhead: number; targetBehind: number };
  message: string;
  messageCode?: IntegrationMessage;
  errorInfo?: ErrorInfo;
}
export interface Snapshot {
  repositories: Record<string, RepoState>;
  relations: Record<string, IntegrationState>;
  checkedAt: string;
}
export interface IntegrationHistory {
  comparison: IntegrationState;
  sourceTip: Commit | null;
  targetTip: Commit | null;
  commonBases: Commit[];
  includedAt: Commit | null;
  shallow: boolean;
  // Development descending from the common bases to each tip, excluding shared
  // history and older side histories. These totals are not the pending count.
  sourceOnly: { commits: Commit[]; total: number | null; hasMore: boolean };
  targetOnly: { commits: Commit[]; total: number | null; hasMore: boolean };
}
