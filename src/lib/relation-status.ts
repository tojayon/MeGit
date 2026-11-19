import type { TFunction } from 'i18next';
import type { FlowEdge, IntegrationState } from '../../shared/types';

export function relationLabelState(
  kind: FlowEdge['kind'],
  result?: Pick<IntegrationState, 'state' | 'divergence'>,
) {
  if (kind !== 'integration') return kind;
  if (!result?.divergence) return result?.state ?? 'unknown';
  const { targetAhead, targetBehind } = result.divergence;
  if (targetAhead && targetBehind) return 'diverged';
  if (targetAhead) return 'targetAhead';
  if (targetBehind) return 'targetBehind';
  return 'refsInSync';
}

export function relationStatus(
  t: TFunction,
  relation: FlowEdge,
  result?: IntegrationState,
): string {
  if (relation.kind !== 'integration') return relation.label || t(`relation.${relation.kind}`);
  if (result?.divergence) {
    const { targetAhead, targetBehind } = result.divergence;
    const state = relationLabelState(relation.kind, result);
    if (state === 'diverged')
      return t('relation.diverged', { ahead: targetAhead, behind: targetBehind });
    if (state === 'targetAhead') return t('relation.targetAhead', { count: targetAhead });
    if (state === 'targetBehind') return t('relation.targetBehind', { count: targetBehind });
    return t('relation.refsInSync');
  }
  if (result?.state === 'integrated') return t('relation.integrated');
  if (result?.state === 'pending') return t('relation.pending', { count: result.pending ?? 0 });
  return t('relation.unknown');
}
