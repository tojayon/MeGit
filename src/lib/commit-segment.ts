import type { Commit } from '../../shared/types';
import type { TreeEdge } from './branch-tree';

/** Keep the folded edge's actual parent chain, including its two context endpoints. */
export function commitSegment(
  commits: Commit[],
  edge: Pick<TreeEdge, 'child' | 'via' | 'parent'>,
): Commit[] {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const hashes = [edge.child, ...edge.via, edge.parent];
  if (new Set(hashes).size !== hashes.length) return [];
  const segment = hashes.map((hash) => byHash.get(hash));
  if (segment.some((commit) => !commit)) return [];
  const result = segment as Commit[];
  return result.every(
    (commit, index) => !result[index + 1] || commit.parents.includes(result[index + 1].hash),
  )
    ? result
    : [];
}
