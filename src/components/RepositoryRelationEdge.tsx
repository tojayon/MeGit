import { memo, useId, type CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useStore,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { GitMerge, Link2, CircleHelp, GitPullRequestArrow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FlowEdge, Snapshot } from '../../shared/types';
import { useEdgeRoute, type RouteEditing } from './EdgeRouteEditor';
import { Tooltip } from './Tooltip';
import { relationLabelState, relationStatus } from '../lib/relation-status';

export type RelationEdge = Edge<
  RouteEditing & {
    relation: FlowEdge;
    result?: Snapshot['relations'][string];
    focused: boolean;
    labelOffset: number;
    onOpen: (id: string) => void;
  },
  'relation'
>;

export const RepositoryRelationEdge = memo(function RepositoryRelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<RelationEdge>) {
  const { t } = useTranslation();
  const compact = useStore((state) => state.transform[2] < 0.7);
  const marker = useId().replace(/:/g, '');
  const { relation, result, focused, labelOffset } = data!;
  const options = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [automaticPath, automaticX, automaticY] =
    relation.routing === 'bezier'
      ? getBezierPath(options)
      : relation.routing === 'straight'
        ? getStraightPath(options)
        : getSmoothStepPath({
            ...options,
            borderRadius: relation.routing === 'step' ? 0 : 32,
            offset: 40,
          });
  const route = useEdgeRoute({
    id,
    automaticPath,
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    waypoints: relation.waypoints,
    radius: relation.routing === 'step' || relation.routing === 'straight' ? 0 : 24,
    editing: data!.editing,
    onRoute: data!.onRoute,
  });
  const integration = relation.kind === 'integration';
  const status = relationStatus(t, relation, result);
  const anchorX = route.custom ? route.label.x : automaticX;
  const anchorY = route.custom ? route.label.y : automaticY;
  const name = relation.label || t(`relation.${relation.kind}`);
  const Icon = !integration
    ? Link2
    : result?.state === 'integrated'
      ? GitMerge
      : result?.state === 'pending'
        ? GitPullRequestArrow
        : CircleHelp;
  const stroke =
    selected || focused
      ? 'var(--accent)'
      : integration
        ? 'var(--edge-integration)'
        : 'var(--edge-neutral)';
  return (
    <>
      <defs>
        <marker
          id={`${marker}-bridge-source`}
          viewBox="-6 -6 12 12"
          refX="0"
          refY="0"
          markerWidth="16"
          markerHeight="16"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <circle r="3.5" fill="var(--canvas)" stroke={stroke} strokeWidth="1.8" />
        </marker>
        <marker
          id={`${marker}-bridge-target`}
          viewBox="-8 -8 16 16"
          refX="0"
          refY="0"
          markerWidth="20"
          markerHeight="20"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path
            d="M -5 -6 Q 0 -6 0 0 Q 0 6 -5 6"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </marker>
      </defs>
      <g
        className="workflow-edge-track"
        data-detail={compact ? 'compact' : undefined}
        data-emphasis={selected ? 'selected' : focused ? 'related' : undefined}
        style={{ '--relation-stroke': stroke } as CSSProperties}
      >
        <path className="workflow-edge-rails" d={route.path} aria-hidden="true" />
        <path className="workflow-edge-gap" d={route.path} aria-hidden="true" />
        <BaseEdge
          id={id}
          className="workflow-edge-path"
          path={route.path}
          markerStart={`url(#${marker}-bridge-source)`}
          markerEnd={`url(#${marker}-bridge-target)`}
          interactionWidth={22}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className="repository-relation-position nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${anchorX}px, ${anchorY + labelOffset + (data!.editing ? 24 : 0)}px)`,
            pointerEvents: 'all',
          }}
        >
          <Tooltip
            className="repository-relation-anchor"
            detailed
            placement="top"
            content={
              <>
                <strong>{name}</strong>
                <span>{status}</span>
                <span>{t(`relation.${relation.kind}Help`)}</span>
                <span>{t('relation.bridgeHelp')}</span>
              </>
            }
          >
            <button
              type="button"
              className={`edge-label repository-relation-label nodrag nopan ${selected ? 'selected' : ''} ${focused ? 'context-related' : ''}`}
              data-edge-id={id}
              data-state={relationLabelState(relation.kind, result)}
              onClick={(event) => {
                event.stopPropagation();
                data!.onOpen(id);
              }}
              aria-label={`${name} · ${integration && result?.state === 'integrated' && !result.divergence ? t('relation.included') : status}`}
            >
              <Icon size={14} />
              <span>{status}</span>
            </button>
          </Tooltip>
        </div>
      </EdgeLabelRenderer>
      {route.controls}
    </>
  );
});
