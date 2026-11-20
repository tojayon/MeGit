import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Board, Repository } from '../../shared/types';
import {
  applyBoardOperations,
  boardSignature,
  type AssistantBoardPlan as Plan,
} from '../../shared/assistant-board';
import { Button } from './Button';
import { groupBounds, noteSize, REPOSITORY_SIZE } from '../lib/whiteboard';

function BoardMap({
  board,
  repositories,
  label,
}: {
  board: Board;
  repositories: Repository[];
  label: string;
}) {
  const marker = useId();
  const elements = [
    ...board.nodes.map((node) => ({
      ...node,
      title:
        node.displayName ||
        repositories.find((repo) => repo.id === node.repoId)?.name ||
        node.repoId,
      kind: 'repository',
      ...REPOSITORY_SIZE,
    })),
    ...(board.notes || []).map((note) => ({ ...note, ...noteSize(note) })),
  ];
  const groups = (board.groups || []).map((group) => ({
    ...group,
    ...groupBounds(group, board.nodes),
  }));
  const minX =
    (elements.length
      ? Math.min(...elements.map((item) => item.position.x), ...groups.map((group) => group.x))
      : 0) - 20;
  const minY =
    (elements.length
      ? Math.min(...elements.map((item) => item.position.y), ...groups.map((group) => group.y))
      : 0) - 20;
  const width = Math.max(
    320,
    ...elements.map((item) => item.position.x - minX + item.width + 20),
    ...groups.map((group) => group.x - minX + group.width + 20),
  );
  const height = Math.max(
    160,
    ...elements.map((item) => item.position.y - minY + item.height + 20),
    ...groups.map((group) => group.y - minY + group.height + 20),
  );
  return (
    <svg
      className="assistant-board-map"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8Z" />
        </marker>
      </defs>
      {groups.map((group) => (
        <g key={group.id}>
          <rect
            className="assistant-board-group"
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx="8"
          />
          <text x={group.x + 12} y={group.y + 24}>
            {group.name}
          </text>
        </g>
      ))}
      {[...board.edges, ...(board.connections || [])].map((edge) => {
        const source = elements.find((item) => item.id === edge.source),
          target = elements.find((item) => item.id === edge.target);
        if (!source || !target) return null;
        const horizontal =
          Math.abs(target.position.x - source.position.x) >
          Math.abs(target.position.y - source.position.y);
        const forward = horizontal
          ? target.position.x >= source.position.x
          : target.position.y >= source.position.y;
        const x1 =
            source.position.x + (horizontal ? (forward ? source.width : 0) : source.width / 2),
          y1 = source.position.y + (horizontal ? source.height / 2 : forward ? source.height : 0),
          x2 = target.position.x + (horizontal ? (forward ? 0 : target.width) : target.width / 2),
          y2 = target.position.y + (horizontal ? target.height / 2 : forward ? 0 : target.height);
        return (
          <g key={edge.id}>
            <path
              className="assistant-board-line"
              strokeDasharray={'kind' in edge ? '8 6' : undefined}
              d={`M${x1},${y1} L${x2},${y2}`}
              markerEnd={'kind' in edge ? undefined : `url(#${marker})`}
            />
            <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2}>
              {edge.label}
            </text>
          </g>
        );
      })}
      {elements.map((item) => (
        <g key={item.id} transform={`translate(${item.position.x},${item.position.y})`}>
          <title>{item.title}</title>
          {item.kind === 'decision' ? (
            <path
              className="assistant-board-shape"
              d={`M${item.width / 2} 0L${item.width} ${item.height / 2}L${item.width / 2} ${item.height}L0 ${item.height / 2}Z`}
            />
          ) : (
            <rect
              className={`assistant-board-shape${item.kind === 'repository' ? ' assistant-board-repository' : ''}`}
              width={item.width}
              height={item.height}
              rx={item.kind === 'start' || item.kind === 'end' ? item.height / 2 : 5}
            />
          )}
          <text x={item.width / 2} y={item.height / 2 + 5} textAnchor="middle">
            {item.title.length > 13 ? `${item.title.slice(0, 12)}…` : item.title}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function AssistantBoardPlan({
  plan,
  board,
  repositories,
  ready,
  busy,
  status,
  onApply,
  onDiscard,
}: {
  plan: Plan;
  board?: Board;
  repositories: Repository[];
  ready: boolean;
  busy: boolean;
  status?: 'applied' | 'discarded';
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = now > Date.parse(plan.expiresAt);
  const stale = !board || board.id !== plan.boardId || boardSignature(board) !== plan.baseline;
  let after: Board | undefined;
  if (board && !stale && !board.layoutLocked)
    try {
      after = applyBoardOperations(board, plan.operations);
    } catch {
      /* Invalid proposals cannot be applied. */
    }
  const nameOf = (id: string): string => {
    const step =
      after?.notes?.find((item) => item.id === id) || board?.notes?.find((item) => item.id === id);
    const node = board?.nodes.find((item) => item.id === id);
    return (
      step?.title ||
      node?.displayName ||
      repositories.find((repo) => repo.id === node?.repoId)?.name ||
      id
    );
  };
  const connectionName = (id: string) => {
    const connection = board?.connections?.find((item) => item.id === id);
    return connection
      ? `${nameOf(connection.source)} → ${nameOf(connection.target)} ${connection.label}`
      : id;
  };
  return (
    <section className="assistant-plan assistant-board-plan" aria-label={t('assistant.board.plan')}>
      <div className="assistant-plan-heading">
        <strong>{t('assistant.board.plan')}</strong>
        <span>{plan.boardName}</span>
      </div>
      <div className="assistant-board-content">
        <ol>
          {plan.operations.map((operation, index) => (
            <li key={index}>
              <strong>{t(`assistant.board.operations.${operation.type}`)}</strong>{' '}
              {operation.type === 'addStep'
                ? operation.title
                : operation.type === 'connect'
                  ? `${nameOf(operation.source)} → ${nameOf(operation.target)} ${operation.label}`
                  : operation.type === 'updateBoard'
                    ? operation.name || operation.description
                    : operation.type === 'arrange'
                      ? t(`assistant.board.${operation.direction}`)
                      : operation.type === 'updateConnection' ||
                          operation.type === 'removeConnection'
                        ? connectionName(operation.id)
                        : nameOf(operation.id)}
              {(operation.type === 'addStep' ||
                operation.type === 'updateBoard' ||
                operation.type === 'updateStep' ||
                operation.type === 'updateConnection' ||
                operation.type === 'moveElement') && (
                <details>
                  <summary>{t('assistant.board.details')}</summary>
                  <dl>
                    {Object.entries(operation)
                      .filter(([key]) => !['type', 'id'].includes(key))
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{t(`assistant.board.fields.${key as 'title'}`)}</dt>
                          <dd>
                            {typeof value === 'object'
                              ? `${value.x}, ${value.y}`
                              : key === 'source' || key === 'target'
                                ? nameOf(String(value))
                                : key === 'kind'
                                  ? t(`flowchart.${value as 'start'}`)
                                  : String(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ol>
        {after && !status && (
          <details open>
            <summary>{t('assistant.board.preview')}</summary>
            <BoardMap
              board={after}
              repositories={repositories}
              label={t('assistant.board.preview')}
            />
          </details>
        )}
        <p role="status">
          {status
            ? t(`assistant.board.${status}`)
            : t(
                expired
                  ? 'errors.assistantPlanExpired'
                  : stale
                    ? 'errors.assistantBoardChanged'
                    : board?.layoutLocked
                      ? 'errors.assistantBoardLocked'
                      : !ready
                        ? 'assistant.board.waitSave'
                        : 'assistant.board.review',
              )}
        </p>
      </div>
      {!status && (
        <div className="assistant-plan-actions">
          <Button
            variant="primary"
            disabled={busy || !ready || expired || stale || !after}
            onClick={onApply}
          >
            {t('assistant.board.apply')}
          </Button>
          <Button disabled={busy} onClick={onDiscard}>
            {t('assistant.discard')}
          </Button>
        </div>
      )}
    </section>
  );
}
