import { z } from 'zod';
import type { RepoState } from './types.js';
export const assistantGuideKinds = [
  'addRemote',
  'setTracking',
  'publishBranch',
  'fetch',
  'worktree',
  'branches',
  'remotes',
] as const;
export const assistantGuideSchema = z.strictObject({
  repositoryId: z.string().min(1).max(128),
  kind: z.enum(assistantGuideKinds),
});
export type AssistantGuide = z.infer<typeof assistantGuideSchema>;
export type AssistantGuideKind = AssistantGuide['kind'];

// Availability is determined from Git state, never from translated assistant prose.
export function availableAssistantGuides(state: RepoState): AssistantGuideKind[] {
  if (state.error) return [];
  const result: AssistantGuideKind[] = ['worktree', 'branches'];
  if (state.remotes.length) result.push('remotes', 'fetch');
  else result.push('addRemote');
  const writableBranch =
    !state.detached && !state.operation && !state.files.some((file) => file.conflicted);
  if (state.remotes.length && writableBranch && (!state.upstream || !state.upstreamHead)) {
    if (state.branches.some((branch) => branch.remote)) result.push('setTracking');
    if (state.head && !state.trackingConfigured) result.push('publishBranch');
  }
  return result;
}

export function defaultAssistantGuides(state: RepoState): AssistantGuideKind[] {
  const available = availableAssistantGuides(state);
  if (!available.length) return [];
  if (state.detached) return ['branches'];
  if (state.operation || state.files.some((file) => file.conflicted)) return ['worktree'];
  if (!state.remotes.length) return ['addRemote'];
  if (!state.upstream || !state.upstreamHead)
    return available.filter((kind) => ['fetch', 'setTracking', 'publishBranch'].includes(kind));
  if (state.changed && !state.staged) return ['worktree'];
  return [];
}

export function filterAssistantGuides(
  guides: AssistantGuide[],
  states: Map<string, RepoState>,
): AssistantGuide[] {
  const seen = new Set<string>();
  return guides
    .filter((guide) => {
      const state = states.get(guide.repositoryId);
      const key = `${guide.repositoryId}:${guide.kind}`;
      if (!state || seen.has(key) || !availableAssistantGuides(state).includes(guide.kind))
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}
