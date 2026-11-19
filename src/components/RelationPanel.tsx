import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import { ArrowRight, Check, CircleHelp, GitMerge, Link2 } from 'lucide-react';
import type { FlowEdge, IntegrationState, Repository } from '../../shared/types';
import { formatError } from '../lib/messages';
import { PanelHeader } from './PanelHeader';
import { HelpTip } from './GitHelp';
import { RepositoryAvatar } from './RepositoryAvatar';
import { useViewState, useScrollMemory } from '../lib/use-view-state';
import { isBoolean } from '../lib/view-storage';

export function RelationPanel({
  edge,
  viewKey,
  source,
  target,
  result,
  onClose,
}: {
  edge: FlowEdge;
  viewKey?: string;
  source?: Repository;
  target?: Repository;
  result?: IntegrationState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useViewState(viewKey && `${viewKey}.basis`, false, isBoolean);
  useScrollMemory(scroll, viewKey && `${viewKey}.scroll`, edge.kind !== 'integration' || !!result);
  const uncertain = !result || result.state === 'unknown';
  const explanation = result?.errorInfo
    ? formatError(result.errorInfo)
    : result?.messageCode
      ? t(`integration.${result.messageCode}`, { count: result.pending ?? 0 })
      : t('relation.reading');
  return (
    <aside className="inspector relation-inspector" aria-label={t('relation.details')}>
      <PanelHeader
        title={edge.label || t(`relation.${edge.kind}`)}
        icon={<Link2 size={20} />}
        closeLabel={t('relation.close')}
        onClose={onClose}
        actions={<HelpTip topic={edge.kind} />}
      />
      <div ref={scroll} className="relation-panel-body">
        <div className="relation-endpoints">
          <div>
            <span>{t('relation.source')}</span>
            <strong className="repository-identity">
              {source && <RepositoryAvatar repo={source} size="small" />}
              {source?.name}
            </strong>
            {edge.kind === 'integration' && <code>{edge.sourceRef}</code>}
          </div>
          <ArrowRight size={18} />
          <div>
            <span>{t('relation.target')}</span>
            <strong className="repository-identity">
              {target && <RepositoryAvatar repo={target} size="small" />}
              {target?.name}
            </strong>
            {edge.kind === 'integration' && <code>{edge.targetRef}</code>}
          </div>
        </div>
        {edge.kind === 'integration' ? (
          <div className={`integration-result ${result?.state || 'unknown'}`}>
            <div>
              {result?.state === 'integrated' ? (
                <Check size={21} />
              ) : result?.state === 'pending' ? (
                <GitMerge size={21} />
              ) : (
                <CircleHelp size={21} />
              )}
              <strong>
                {result?.state === 'integrated'
                  ? t('relation.includedTitle')
                  : result?.state === 'pending'
                    ? t('relation.pendingTitle', { count: result.pending ?? 0 })
                    : t('relation.unknownTitle')}
              </strong>
              <HelpTip topic="comparison" />
            </div>
            {uncertain && <p>{explanation}</p>}
            {(!uncertain || result?.sourceHead) && (
              <details
                className="result-details"
                open={expanded}
                onToggle={(event) => setExpanded(event.currentTarget.open)}
              >
                <summary>{t('relation.basis')}</summary>
                {!uncertain && <p>{explanation}</p>}
                {result?.sourceHead && (
                  <dl>
                    <div>
                      <dt>{t('relation.sourceCommit')}</dt>
                      <dd>
                        <code title={result.sourceHead}>{result.sourceHead.slice(0, 12)}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('relation.targetCommit')}</dt>
                      <dd>
                        <code title={result.targetHead || ''}>
                          {result.targetHead?.slice(0, 12)}
                        </code>
                      </dd>
                    </div>
                  </dl>
                )}
              </details>
            )}
          </div>
        ) : (
          <div className="relation-info">
            <Link2 size={22} />
            <p>
              {edge.kind === 'dependency'
                ? t('relation.dependencyInfo')
                : t('relation.deliveryInfo')}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
