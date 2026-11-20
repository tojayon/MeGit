import { cardRefLabel, cardUsesWorktree, relationActionRef, relationRefs, relationUpstreamMatches } from '../../shared/card-refs';
import type { FlowEdge, FlowNode, RelationAction, Repository, Snapshot } from '../../shared/types';
import type { ErrorCode } from '../../shared/messages';

export type RelationShortcut = {
  type: RelationAction['type'];
  from: string;
  to: string;
  recommended?: boolean;
  blocked?: ErrorCode;
};

export function relationShortcuts(
  edge: FlowEdge,
  nodes: FlowNode[],
  repositories: Repository[],
  snapshot: Snapshot | null,
) {
  if (edge.kind !== 'integration' || !snapshot) return;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  const sourceRepo = repositories.find((repo) => repo.id === source?.repoId);
  const targetRepo = repositories.find((repo) => repo.id === target?.repoId);
  if (!source || !target || !sourceRepo || !targetRepo) return;
  const sourceState = snapshot.repositories[sourceRepo.id];
  const targetState = snapshot.repositories[targetRepo.id];
  const result = snapshot.relations[edge.id];
  if (!sourceState || !targetState || sourceState.error || targetState.error ||
    !result?.sourceHead || !result.targetHead) return;
  const refs = relationRefs(edge, nodes);
  const sourceRef = relationActionRef(refs.sourceRef, sourceState);
  const targetRef = relationActionRef(refs.targetRef, targetState);
  if (!sourceRef || !targetRef) return;
  const base = {
    source: source.id, target: target.id, sourceRepo: sourceRepo.id, targetRepo: targetRepo.id,
    sourceRef, targetRef, sourceHead: result.sourceHead, targetHead: result.targetHead,
  };
  const sourceName = `${source.displayName || sourceRepo.name} · ${cardRefLabel(sourceRef)}`;
  const targetName = `${target.displayName || targetRepo.name} · ${cardRefLabel(targetRef)}`;
  if (sourceRepo.id !== targetRepo.id) {
    if (!edge.localIntegration || !sourceRef.startsWith('refs/heads/') ||
      !targetRef.startsWith('refs/heads/') ||
      (!cardUsesWorktree(targetRef, targetState) || targetState.head !== base.targetHead) ||
      (refs.sourceRef === 'HEAD' && sourceState.head !== base.sourceHead) ||
      result.state === 'integrated') return;
    const shortcuts: RelationShortcut[] = [{
      type: 'integrate', from: sourceName, to: targetName,
      blocked: targetState.operation ? 'branchOperation' : targetState.changed ? 'dirtyPull' : undefined,
    }];
    return { base, repo: targetRepo, shortcuts };
  }
  const sourceIsLocal = sourceRef.startsWith('refs/heads/');
  const localRef = sourceIsLocal ? sourceRef : targetRef;
  const remoteRef = sourceIsLocal ? targetRef : sourceRef;
  if (!relationUpstreamMatches(localRef, remoteRef, sourceState) ||
    sourceState.head !== (sourceIsLocal ? base.sourceHead : base.targetHead) ||
    sourceState.upstreamHead !== (sourceIsLocal ? base.targetHead : base.sourceHead)) return;
  const localName = sourceIsLocal ? sourceName : targetName;
  const remoteName = sourceIsLocal ? targetName : sourceName;
  const blocked = sourceState.operation ? 'branchOperation' :
    sourceState.ahead && sourceState.behind ? 'relationNonFastForward' : undefined;
  const shortcuts: RelationShortcut[] = [
    { type: 'pull', from: remoteName, to: localName,
      recommended: !blocked && !sourceState.changed && !!sourceState.behind,
      blocked: blocked || (sourceState.changed ? 'dirtyPull' : undefined) },
    { type: 'push', from: localName, to: remoteName,
      recommended: !blocked && !!sourceState.ahead, blocked },
  ];
  return { base, repo: sourceRepo, shortcuts };
}
