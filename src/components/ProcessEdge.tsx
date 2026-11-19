import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { FlowConnection } from '../../shared/types';
import { Tooltip } from './Tooltip';
import { useEdgeRoute, type RouteEditing } from './EdgeRouteEditor';

export type ProcessEdgeType = Edge<
  RouteEditing & { connection: FlowConnection; focused: boolean; onOpen: (id: string) => void },
  'process'
>;

export const ProcessEdge = memo(function ProcessEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<ProcessEdgeType>) {
  const { t } = useTranslation();
  const { connection } = data!;
  const [automaticPath, automaticX, automaticY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset: 26,
  });
  const route = useEdgeRoute({
    id,
    automaticPath,
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    waypoints: connection.waypoints,
    editing: data!.editing,
    onRoute: data!.onRoute,
  });
  const path = route.path;
  const x = route.custom ? route.label.x : automaticX;
  const y = route.custom ? route.label.y : automaticY;
  const labelOffset = data!.editing ? 24 : 0;
  return (
    <>
      <BaseEdge
        id={id}
        className={`process-edge-path ${selected || data!.focused ? 'is-active' : ''}`}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={22}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${x}px, ${y + labelOffset}px)`,
            pointerEvents: 'all',
          }}
        >
          <Tooltip content={t('flowchart.reconnectHelp')} placement="top">
            <button
              className={`process-edge-label edge-label nodrag nopan ${selected ? 'selected' : ''} ${connection.label ? '' : 'is-empty'}`}
              data-edge-id={id}
              style={{
                position: 'relative',
                pointerEvents: 'all',
              }}
              aria-label={
                connection.label
                  ? t('flowchart.namedConnection', { name: connection.label })
                  : t('flowchart.connection')
              }
              onClick={(e) => {
                e.stopPropagation();
                data!.onOpen(id);
              }}
            >
              {connection.label || t('flowchart.connection')}
            </button>
          </Tooltip>
        </div>
      </EdgeLabelRenderer>
      {route.controls}
    </>
  );
});
