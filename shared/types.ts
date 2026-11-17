import type { ErrorInfo, IntegrationMessage } from './messages.js';
export type RelationKind = 'integration' | 'dependency' | 'delivery';
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
export type EdgeRouting = 'smoothstep' | 'step' | 'bezier' | 'straight';
export interface Repository {
  id: string;
  name: string;
  path: string;
  logoPath?: string;
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
  position: { x: number; y: number };
}
export interface FlowNote {
  id: string;
  title: string;
  text: string;
  position: { x: number; y: number };
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind: RelationKind;
  label: string;
  sourceRef: string;
  targetRef: string;
  routing?: EdgeRouting;
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
  hash: string;
  shortHash: string;
  parents: string[];
  subject: string;
  author: string;
  date: string;
  refs: string;
}
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
export type GitAction =
  | BranchAction
  | { type: 'stage' | 'unstage'; paths: string[] }
  | { type: 'commit'; message: string }
  | { type: 'fetch' | 'pull' | 'push' };
export interface IntegrationState {
  state: 'integrated' | 'pending' | 'unknown';
  sourceHead: string | null;
  targetHead: string | null;
  pending: number | null;
  message: string;
  messageCode?: IntegrationMessage;
  errorInfo?: ErrorInfo;
}
export interface Snapshot {
  repositories: Record<string, RepoState>;
  relations: Record<string, IntegrationState>;
  checkedAt: string;
}
