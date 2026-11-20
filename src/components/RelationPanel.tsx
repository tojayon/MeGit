import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleHelp, GitMerge, Link2 } from 'lucide-react';
import type {
  FlowEdge,
  IntegrationState,
  IntegrationHistory,
  Repository,
} from '../../shared/types';
import { formatError } from '../lib/messages';
import { PanelHeader } from './PanelHeader';
import { HelpTip } from './GitHelp';
import { RelationRepositoryCard } from './RelationRepositoryCard';
import { IntegrationComparison } from './IntegrationComparison';
import { api } from '../lib/api';
import { Button } from './Button';
import { useViewState, useScrollMemory } from '../lib/use-view-state';
import { isBoolean } from '../lib/view-storage';

export function RelationPanel({
  edge,
  boardId,
  sampleHistory,
  viewKey,
  source,
  target,
  result,
  onClose,
}: {
  edge: FlowEdge;
  boardId?: string;
  sampleHistory?: IntegrationHistory;
  viewKey?: string;
  source?: Repository;
  target?: Repository;
  result?: IntegrationState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<IntegrationHistory>();
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const historyKey = JSON.stringify([
    boardId,
    edge.id,
    edge.kind,
    source?.id,
    source?.path,
    target?.id,
    target?.path,
    edge.sourceRef,
    edge.targetRef,
    result?.sourceHead,
    result?.targetHead,
    result?.state,
    result?.messageCode,
    retry,
  ]);
  const [loadedKey, setLoadedKey] = useState(historyKey);
  if (loadedKey !== historyKey) {
    setLoadedKey(historyKey);
    setHistory(undefined);
    setHistoryError(null);
    setLoading(false);
  }
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    if (boardId && edge.kind === 'integration' && !sampleHistory) {
      void api
        .integrationHistory(boardId, edge.id, {}, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted && version === generation.current) setHistory(data);
        })
        .catch((error) => {
          if (!controller.signal.aborted && version === generation.current) setHistoryError(error);
        })
        .finally(() => {
          if (version === generation.current) setLoading(false);
        });
    }
    return () => {
      controller.abort();
      generation.current = version + 1;
    };
  }, [historyKey, boardId, edge.id, edge.kind, sampleHistory]);
  const detail = sampleHistory || history;
  const currentResult = detail?.comparison || result;
  const [columns, setColumns] = useState({ source: 25, target: 75 });
  useLayoutEffect(() => {
    const body = scroll.current;
    if (!body) return;
    const update = () => {
      const cards = body.querySelectorAll('.relation-repository-card');
      const map = body.querySelector('.integration-history-map');
      if (cards.length !== 2 || !map) return;
      const a = cards[0].getBoundingClientRect(),
        b = cards[1].getBoundingClientRect();
      const bounds = map.getBoundingClientRect();
      if (!bounds.width) return;
      const next =
        Math.abs(a.top - b.top) < 2
          ? {
              source: ((a.left + a.width / 2 - bounds.left) / bounds.width) * 100,
              target: ((b.left + b.width / 2 - bounds.left) / bounds.width) * 100,
            }
          : { source: 25, target: 75 };
      setColumns((previous) =>
        Math.abs(previous.source - next.source) + Math.abs(previous.target - next.target) < 0.01
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(body);
    const pair = body.querySelector('.relation-repository-pair');
    if (pair) observer.observe(pair);
    update();
    return () => observer.disconnect();
  }, [detail]);
  async function more() {
    if (!boardId || !detail || loading) return;
    const version = generation.current;
    setLoading(true);
    setHistoryError(null);
    try {
      const next = await api.integrationHistory(boardId, edge.id, {
        offset: Math.max(detail.sourceOnly.commits.length, detail.targetOnly.commits.length),
        sourceHash: detail.comparison.sourceHead!,
        targetHash: detail.comparison.targetHead!,
      });
      if (generation.current !== version) return;
      setHistory({
        ...next,
        sourceOnly: {
          ...next.sourceOnly,
          commits: [...detail.sourceOnly.commits, ...next.sourceOnly.commits],
        },
        targetOnly: {
          ...next.targetOnly,
          commits: [...detail.targetOnly.commits, ...next.targetOnly.commits],
        },
      });
    } catch (error) {
      if (version === generation.current) setHistoryError(error);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  const [expanded, setExpanded] = useViewState(viewKey && `${viewKey}.basis`, false, isBoolean);
  useScrollMemory(
    scroll,
    viewKey && `${viewKey}.scroll`,
    edge.kind !== 'integration' || !!detail || !!historyError,
  );
  const uncertain = !currentResult || currentResult.state === 'unknown';
  const explanation = currentResult?.errorInfo
    ? formatError(currentResult.errorInfo)
    : currentResult?.messageCode
      ? t(`integration.${currentResult.messageCode}`, { count: currentResult.pending ?? 0 })
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
        <div className="relation-repository-pair">
          <RelationRepositoryCard
            role="source"
            repo={source}
            reference={edge.kind === 'integration' ? edge.sourceRef : undefined}
          />
          <ArrowRight size={18} />
          <RelationRepositoryCard
            role="target"
            repo={target}
            reference={edge.kind === 'integration' ? edge.targetRef : undefined}
          />
        </div>
        {edge.kind === 'integration' && (
          <>
            {historyError !== null && (
              <div className="relation-history-error" role="alert">
                <p>{formatError(historyError)}</p>
                <Button size="compact" onClick={() => setRetry((value) => value + 1)}>
                  {t('relation.retryHistory')}
                </Button>
              </div>
            )}
            {!historyError && !detail && boardId && (
              <p role="status">{t('relation.loadingHistory')}</p>
            )}
            {detail && (
              <IntegrationComparison
                key={historyKey}
                history={detail}
                columns={columns}
                highlightTips={expanded}
                loading={loading}
                onMore={more}
              />
            )}
          </>
        )}
        {edge.kind === 'integration' ? (
          <div className={`integration-result ${currentResult?.state || 'unknown'}`}>
            <div>
              {currentResult?.state === 'integrated' ? (
                <Check size={21} />
              ) : currentResult?.state === 'pending' ? (
                <GitMerge size={21} />
              ) : (
                <CircleHelp size={21} />
              )}
              <strong>
                {currentResult?.state === 'integrated'
                  ? t('relation.includedTitle')
                  : currentResult?.state === 'pending'
                    ? t('relation.pendingTitle', { count: currentResult.pending ?? 0 })
                    : t('relation.unknownTitle')}
              </strong>
              <span className="integration-result-help">
                <HelpTip topic="comparison" />
              </span>
            </div>
            {uncertain && <p>{explanation}</p>}
            {(!uncertain || currentResult?.sourceHead) && (
              <details
                className="result-details"
                open={expanded}
                onToggle={(event) => setExpanded(event.currentTarget.open)}
              >
                <summary>{t('relation.basis')}</summary>
                {!uncertain && <p>{explanation}</p>}
                {currentResult?.sourceHead && (
                  <dl>
                    <div>
                      <dt>{t('relation.sourceLatest')}</dt>
                      <dd>
                        <code title={currentResult.sourceHead}>
                          {currentResult.sourceHead.slice(0, 12)}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('relation.targetLatest')}</dt>
                      <dd>
                        <code title={currentResult.targetHead || ''}>
                          {currentResult.targetHead?.slice(0, 12)}
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
