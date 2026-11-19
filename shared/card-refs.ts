import { isBranchName, isSafeRef } from './refs.js';
import type { Branch, FlowEdge, FlowNode, RepoState } from './types.js';

export function isCardRef(ref: string): boolean {
  const match = /^refs\/(?:heads|remotes)\/(.+)$/.exec(ref);
  return !!match && isSafeRef(ref) && isBranchName(match[1]);
}

export function branchRef(branch: Branch): string {
  return `${branch.remote ? 'refs/remotes' : 'refs/heads'}/${branch.name}`;
}

export function cardRefLabel(ref: string): string {
  return ref.replace(/^refs\/(?:heads|remotes)\//, '');
}

export function cardUsesWorktree(
  ref: string | undefined,
  state?: Pick<RepoState, 'branch' | 'detached' | 'error'>,
): boolean {
  return (
    !ref || (!!state && !state.error && !state.detached && ref === `refs/heads/${state.branch}`)
  );
}

export function relationRefs(
  edge: Pick<FlowEdge, 'source' | 'target' | 'sourceRef' | 'targetRef'>,
  nodes: Pick<FlowNode, 'id' | 'ref'>[],
): { sourceRef: string; targetRef: string } {
  return {
    sourceRef: edge.sourceRef ?? nodes.find((node) => node.id === edge.source)?.ref ?? 'HEAD',
    targetRef: edge.targetRef ?? nodes.find((node) => node.id === edge.target)?.ref ?? 'HEAD',
  };
}
