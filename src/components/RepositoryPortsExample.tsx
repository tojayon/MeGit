import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  MarkerType,
  useReactFlow,
  useStore,
  type NodeProps,
  type Node,
  type Edge,
  type EdgeProps,
  BaseEdge,
  getSmoothStepPath,
} from '@xyflow/react';
import { RepositoryPorts } from './RepositoryPorts';
import { Field } from './Field';
import { usePreferences } from '../preferences/store';
import { useEdgeRoute, type RouteEditing } from './EdgeRouteEditor';
import type { RoutePoint } from '../lib/edge-route';
import { Button } from './Button';

type ExampleNode = Node<{ name: string }, 'ports'>;
function PortsNode({ data }: NodeProps<ExampleNode>) {
  return (
    <article className="repository-node">
      <RepositoryPorts name={data.name} />
      <div className="node-heading">
        <h3>{data.name}</h3>
      </div>
    </article>
  );
}
const nodeTypes = { ports: PortsNode };
type RouteDemoEdge = Edge<RouteEditing & { waypoints?: RoutePoint[] }, 'routeDemo'>;
function RouteDemo({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<RouteDemoEdge>) {
  const [automaticPath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const route = useEdgeRoute({
    id,
    automaticPath,
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    editing: data!.editing,
    onRoute: data!.onRoute,
    waypoints: data!.waypoints,
  });
  return (
    <>
      <BaseEdge id={id} path={route.path} markerEnd={markerEnd} />
      {route.controls}
    </>
  );
}
const edgeTypes = { routeDemo: RouteDemo };

function FitPortsExample() {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  useEffect(() => {
    if (width && height) void fitView({ padding: 0.2 });
  }, [fitView, width, height]);
  return null;
}

export function RepositoryPortsExample() {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [mode, setMode] = useState('both');
  const [editing, setEditing] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Record<string, RoutePoint[] | undefined>>({});
  const edges: RouteDemoEdge[] = [
    ...(mode === 'incoming' || mode === 'both'
      ? [
          {
            id: 'in',
            source: 'upstream',
            target: 'center',
            sourceHandle: 'source-bottom',
            targetHandle: 'target-right',
          },
        ]
      : []),
    ...(mode === 'outgoing' || mode === 'both'
      ? [
          {
            id: 'out',
            source: 'center',
            target: 'downstream',
            sourceHandle: 'source-right',
            targetHandle: 'target-top',
          },
        ]
      : []),
  ].map((edge) => ({
    ...edge,
    type: 'routeDemo',
    reconnectable: true,
    selected: selectedEdge === edge.id,
    data: {
      editing,
      waypoints: routes[edge.id],
      onRoute: (id, points) => setRoutes((current) => ({ ...current, [id]: points })),
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge-neutral)' },
  }));
  const nodes: ExampleNode[] = [
    { id: 'center', type: 'ports', position: { x: 0, y: 100 }, data: { name: 'MeGit' } },
    { id: 'upstream', type: 'ports', position: { x: 340, y: 0 }, data: { name: 'MeTex' } },
    { id: 'downstream', type: 'ports', position: { x: 340, y: 200 }, data: { name: 'MeFlow' } },
  ];
  return (
    <section className="design-card">
      <h2>{t('routing.example')}</h2>
      <p className="design-caption">{t('routing.exampleHelp')}</p>
      <Field label={t('routing.exampleMode')}>
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          {(['none', 'incoming', 'outgoing', 'both'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`routing.${value}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="design-demo-row">
        <Button size="compact" aria-pressed={editing} onClick={() => setEditing((value) => !value)}>
          {t('routing.editRoute')}
        </Button>
        <Button
          size="compact"
          disabled={!Object.values(routes).some((points) => points?.length)}
          onClick={() => setRoutes({})}
        >
          {t('routing.resetRoute')}
        </Button>
      </div>
      <div ref={container} style={{ height: 'var(--repository-ports-example-height)' }}>
        <ReactFlow
          width={width || undefined}
          minZoom={0.2}
          colorMode={preferences.theme}
          nodes={nodes}
          edges={edges}
          onEdgeClick={(_event, edge) => setSelectedEdge(edge.id)}
          onEdgesChange={(changes) => {
            const change = changes.find((item) => item.type === 'select' && item.selected);
            if (change?.type === 'select') setSelectedEdge(change.id);
          }}
          onPaneClick={() => setSelectedEdge(null)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
        >
          <FitPortsExample />
        </ReactFlow>
      </div>
    </section>
  );
}
