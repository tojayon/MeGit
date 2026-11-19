import { GitCommitHorizontal, CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IntegrationHistory } from '../../shared/types';
import { Tooltip } from './Tooltip';
import { InfoPopover } from './InfoPopover';
import { Button } from './Button';
import { integrationMap } from '../lib/integration-map';

export function IntegrationComparison({
  history,
  columns,
  highlightTips = false,
  loading,
  onMore,
}: {
  history: IntegrationHistory;
  columns?: { source: number; target: number };
  highlightTips?: boolean;
  loading?: boolean;
  onMore?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const map = integrationMap(history, columns);
  return (
    <section className="integration-comparison" aria-label={t('relation.historyGraph')}>
      <div className="comparison-heading">
        <h3>{t('relation.historyGraph')}</h3>
        <Tooltip
          detailed
          content={
            <>
              <strong>{t('relation.historyGraph')}</strong>
              <span>{t('relation.graphHelp')}</span>
              <span>{t('relation.commonHelp')}</span>
              <span>{t('relation.includedAtHelp')}</span>
            </>
          }
        >
          <button type="button" className="icon-button small" aria-label={t('relation.graphAbout')}>
            <CircleHelp size={15} />
          </button>
        </Tooltip>
      </div>
      {history.shallow && <p className="warning-text">{t('relation.shallowHistory')}</p>}
      {map.nodes.length > 0 && (
        <div className="comparison-map-labels">
          <span style={{ left: `${columns?.source ?? 25}%` }}>{t('relation.source')}</span>
          <span style={{ left: `${columns?.target ?? 75}%` }}>{t('relation.target')}</span>
        </div>
      )}
      {map.nodes.length > 0 && (
        <div className="integration-history-map" style={{ height: map.height }}>
          <svg
            className="integration-history-wires"
            viewBox={`0 0 100 ${map.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('relation.realParents')}
          >
            {map.edges.map((edge) => (
              <path
                key={`${edge.child}-${edge.parent}`}
                d={`M ${edge.x1} ${edge.y1} C ${edge.x1} ${(edge.y1 + edge.y2) / 2} ${edge.x2} ${(edge.y1 + edge.y2) / 2} ${edge.x2} ${edge.y2}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {map.nodes.map((node) => (
            <div
              key={node.commit.hash}
              data-commit-hash={node.commit.hash}
              className={`integration-map-point ${node.kind}${highlightTips && (node.commit.hash === history.sourceTip?.hash || node.commit.hash === history.targetTip?.hash) ? ' basis-highlight' : ''}`}
              style={{ left: `${node.x}%`, top: node.row * 56 + 28 }}
            >
              <InfoPopover
                label={t('branchTree.commitDetails')}
                triggerLabel={`${node.commit.shortHash} · ${node.commit.subject}`}
                triggerClassName="integration-map-commit"
                help={t('relation.openCommit')}
                triggerContent={
                  <>
                    <GitCommitHorizontal size={18} aria-hidden="true" />
                    <code>{node.commit.hash.slice(0, 7)}</code>
                    {highlightTips &&
                      (node.commit.hash === history.sourceTip?.hash ||
                        node.commit.hash === history.targetTip?.hash) && (
                        <span className="basis-commit-role">
                          {[
                            node.commit.hash === history.sourceTip?.hash
                              ? t('relation.sourceLatest')
                              : '',
                            node.commit.hash === history.targetTip?.hash
                              ? t('relation.targetLatest')
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' / ')}
                        </span>
                      )}
                  </>
                }
              >
                <div className="comparison-commit-info">
                  <strong>{node.commit.subject}</strong>
                  <code>{node.commit.hash}</code>
                  <span>{node.commit.author}</span>
                  {node.commit.date && (
                    <time dateTime={node.commit.date}>
                      {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(node.commit.date))}
                    </time>
                  )}
                  <div className="comparison-commit-roles">
                    {node.kind === 'common' && (
                      <span>{t('relation.commonBase', { count: history.commonBases.length })}</span>
                    )}
                    {node.commit.hash === history.sourceTip?.hash && (
                      <span>{t('relation.sourceLatest')}</span>
                    )}
                    {node.commit.hash === history.targetTip?.hash && (
                      <span>{t('relation.targetLatest')}</span>
                    )}
                    {node.commit.hash === history.includedAt?.hash && (
                      <span>{t('relation.firstIncluded')}</span>
                    )}
                  </div>
                  {node.commit.hash === history.includedAt?.hash && (
                    <p>
                      {t(
                        history.includedAt.hash === history.sourceTip?.hash
                          ? 'relation.sameCommit'
                          : 'relation.includedAtPopupNote',
                      )}
                    </p>
                  )}
                  {node.boundary && <p>{t('relation.historyBoundary')}</p>}
                </div>
              </InfoPopover>
            </div>
          ))}
        </div>
      )}
      {(history.sourceOnly.hasMore || history.targetOnly.hasMore) && onMore && (
        <Button size="compact" busy={!!loading} onClick={onMore}>
          {t('relation.moreHistory')}
        </Button>
      )}
    </section>
  );
}
