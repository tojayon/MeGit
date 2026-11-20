import { useEffect, useRef, useState } from 'react';
import { ReactFlow, type Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { RepositoryRelationEdge, type RelationEdge } from './RepositoryRelationEdge';
import { RepositoryPorts } from './RepositoryPorts';
import { relationPorts } from '../lib/relation-ports';
import { usePreferences } from '../preferences/store';
import { Field } from './Field';
import { RelationActionConfirmation } from './RelationActionDialog';
import type { RelationShortcut } from '../lib/relation-actions';
import type { IntegrationState } from '../../shared/types';

function ExampleRepository({ data }: { data: { name: string } }) {
  return (
    <article className="repository-node relation-example-node">
      <RepositoryPorts name={data.name} />
      <div className="node-heading">
        <h3>{data.name}</h3>
      </div>
    </article>
  );
}
const nodeTypes = { repository: ExampleRepository };
const edgeTypes = { relation: RepositoryRelationEdge };

export function RelationBridgeExample() {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const [layout, setLayout] = useState('horizontal');
  const [state, setState] = useState<IntegrationState['state']>('integrated');
  const [selected, setSelected] = useState(false);
  const [sync, setSync] = useState('none');
  const upstream = sync === 'upstream' || sync === 'pendingPull' || sync === 'pendingPush';
  const [shortcut, setShortcut] = useState<RelationShortcut | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 400));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const target =
    layout === 'vertical'
      ? { x: 0, y: 260 }
      : layout === 'diagonal'
        ? { x: narrow ? 60 : 380, y: 240 }
        : { x: narrow ? 270 : 480, y: 0 };
  const ports = relationPorts(
    {},
    { x: 0, y: 0, width: 180, height: 50 },
    { ...target, width: 180, height: 50 },
  );
  const nodes: Node[] = [
    { id: 'source', type: 'repository', position: { x: 0, y: 0 }, data: { name: 'MeWiki' } },
    { id: 'target', type: 'repository', position: target, data: { name: 'MeWiki-Server' } },
  ];
  const edge: RelationEdge = {
    id: 'bridge-example',
    source: 'source',
    target: 'target',
    type: 'relation',
    sourceHandle: `source-${ports.sourcePort}`,
    targetHandle: `target-${ports.targetPort}`,
    selected,
    data: {
      relation: {
        id: 'bridge-example',
        source: 'source',
        target: 'target',
        kind: 'integration',
        label: '',
        sourceRef: 'main',
        targetRef: 'main',
      },
      result: {
        state: sync === 'pendingPush' ? 'pending' : upstream ? 'integrated' : state,
        pending: state === 'pending' ? 2 : 0,
        divergence: upstream ? {
          targetAhead: sync === 'pendingPull' ? 1 : 0,
          targetBehind: sync === 'pendingPush' ? 1 : 0,
        } : undefined,
        sourceHead: null,
        targetHead: null,
        message: '',
      },
      editing: false,
      onRoute: () => {},
      focused: false,
      labelOffset: 0,
      onOpen: () => setSelected((value) => !value),
      shortcuts: upstream ? [
        { type: 'pull', from: 'MeWiki · origin/main', to: 'MeWiki · main', recommended: sync === 'pendingPull' },
        { type: 'push', from: 'MeWiki · main', to: 'MeWiki · origin/main', recommended: sync === 'pendingPush' },
      ] : sync === 'local' ? [{ type: 'integrate', from: 'MeWiki · main', to: 'MeWiki-Server · main' }] : undefined,
      onShortcut: setShortcut,
    },
  };
  return (
    <section className="design-card">
      <h2>{t('relation.bridgeExample')}</h2>
      <div className="two-fields">
        <Field label={t('relation.bridgeLayout')}>
          <select value={layout} onChange={(event) => setLayout(event.target.value)}>
            {(['horizontal', 'vertical', 'diagonal'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`relation.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('relation.heading')}>
          <select
            value={state}
            disabled={upstream}
            onChange={(event) => setState(event.target.value as IntegrationState['state'])}
          >
            <option value="integrated">{t('relation.integrated')}</option>
            <option value="pending">{t('relation.pending', { count: 2 })}</option>
            <option value="unknown">{t('relation.unknown')}</option>
          </select>
        </Field>
      </div>
      <Field label={t('relation.sync.example')}>
        <select value={sync} onChange={(event) => setSync(event.target.value)}>
          <option value="none">{t('relation.sync.compareOnly')}</option>
          <option value="upstream">{t('relation.sync.upstream')} · {t('relation.refsInSync')}</option>
          <option value="pendingPush">{t('relation.sync.pendingPush')}</option>
          <option value="pendingPull">{t('relation.sync.pendingPull')}</option>
          <option value="local">{t('relation.sync.integrate')}</option>
        </select>
      </Field>
      <div ref={container} style={{ height: 'var(--relation-bridge-example-height)' }}>
        <ReactFlow
          key={`${layout}:${narrow}`}
          nodes={nodes}
          edges={[edge]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={preferences.theme}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.2}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          onEdgeClick={() => setSelected((value) => !value)}
          onPaneClick={() => setSelected(false)}
        />
      </div>
      {shortcut && (
        <RelationActionConfirmation
          shortcut={shortcut}
          onClose={() => setShortcut(null)}
          onConfirm={() => setShortcut(null)}
        />
      )}
    </section>
  );
}
