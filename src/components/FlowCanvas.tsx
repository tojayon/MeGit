import { useTranslation } from 'react-i18next';
import { RepositoryCard } from './RepositoryCard';
import { useRepositoryActions } from '../lib/use-repository-actions';
import type { NoticeMessage } from '../lib/messages';
import { RepositoryPorts } from './RepositoryPorts';
import { useSelectedConnectionPorts } from '../lib/use-selected-connection-ports';
import { repositoryImage } from '../lib/repository-images';
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  useViewport,
  useConnection,
  type Node,
  type NodeProps,
  type Connection,
  type NodeChange,
  SelectionMode,
} from '@xyflow/react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Expand,
  Eye,
  EyeOff,
  FilePenLine,
  FolderGit2,
  GitBranch,
  Group,
  LoaderCircle,
  Map as MapIcon,
  Minus,
  Plus,
  LockKeyhole,
  UnlockKeyhole,
  StickyNote,
  Route,
  RotateCcw,
} from 'lucide-react';
import { RepositoryRelationEdge, type RelationEdge } from './RepositoryRelationEdge';
import { relationPorts } from '../lib/relation-ports';
import type { RoutePoint } from '../lib/edge-route';
import { IconButton } from './IconButton';
import type {
  Board,
  FlowGroup,
  FlowNote,
  PortSide,
  RepoState,
  Repository,
  Snapshot,
} from '../../shared/types';
import { updatePreferences, usePreferences } from '../preferences/store';
import {
  createSnapScene,
  snapMove,
  type SnapGuide,
  type SnapLocks,
  type SnapScene,
} from '../lib/snapping';
import {
  flowContext,
  groupBounds,
  visibleRelations,
  arrangeSelection,
  selectedNodeIds,
  selectionUnits,
  moveSelection,
  reconnectedFlowConnection,
  type Point,
  type Size,
} from '../lib/whiteboard';
import { Tooltip } from './Tooltip';
import { portSides } from './RelationAppearance';
import { CanvasTools } from './CanvasTools';
import { downloadBoard, type ExportColors, type ExportScene } from '../lib/board-export';
import { REPOSITORY_SIZE } from '../lib/whiteboard';
import { noteSize } from '../lib/whiteboard';
import { FlowStep } from './FlowStep';
import { ProcessEdge, type ProcessEdgeType } from './ProcessEdge';
import { useViewState } from '../lib/use-view-state';
import { isBoolean, isStrings, viewKey } from '../lib/view-storage';
import { branchRef, cardRefLabel, cardUsesWorktree } from '../../shared/card-refs';
import { relationStatus } from '../lib/relation-status';

type RepoNode = Node<
  {
    repo: Repository;
    state?: RepoState;
    ref?: string;
    onOpen: (id: string) => void;
    boardId: string;
    onState: (id: string, state: RepoState) => void;
    onRefresh: () => Promise<void>;
    onNotice: (notice: NoticeMessage, error?: boolean) => void;
  },
  'repository'
>;
type GroupPort = { id: string; type: 'source' | 'target'; side: PortSide; offset: number };
type GroupNode = Node<
  {
    group: FlowGroup;
    ports: GroupPort[];
    changed: number;
    unavailable: number;
    reading: boolean;
    onToggle: (id: string) => void;
  },
  'group'
>;
type NoteNode = Node<{ note: FlowNote; connected: boolean; onOpen: (id: string) => void }, 'note'>;
type CanvasNode = RepoNode | GroupNode | NoteNode;
type CanvasEdge = RelationEdge | ProcessEdgeType;
const positions = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function portStyle(side: PortSide, offset: number): CSSProperties {
  return side === 'top' || side === 'bottom' ? { left: `${offset}%` } : { top: `${offset}%` };
}

const RepositoryNode = memo(function RepositoryNode({ id, data, selected }: NodeProps<RepoNode>) {
  const { repo, state, onOpen } = data;
  const actions = useRepositoryActions({
    repo,
    worktreeRef: data.ref,
    viewKey: viewKey(data.boardId, repo.id, repo.path),
    onState: (next) => data.onState(repo.id, next),
    onRefresh: data.onRefresh,
    onNotice: data.onNotice,
  });
  return (
    <RepositoryCard
      repo={repo}
      state={state}
      selected={selected}
      message={actions.message}
      onMessage={actions.setMessage}
      busy={actions.busy}
      onAction={actions.executeAction}
      onGenerate={actions.generateCommit}
      reference={data.ref && cardRefLabel(data.ref)}
      referenceMissing={
        !!data.ref && !!state && !state.branches.some((branch) => branchRef(branch) === data.ref)
      }
      showWorktree={cardUsesWorktree(data.ref, state)}
      onOpen={() => onOpen(id)}
    >
      <RepositoryPorts name={repo.name} />
    </RepositoryCard>
  );
});

const RepositoryGroup = memo(function RepositoryGroup({ data, selected }: NodeProps<GroupNode>) {
  const { t } = useTranslation();
  const { group, ports, changed, unavailable, reading, onToggle } = data;
  const toggleLabel = t(group.collapsed ? 'group.expand' : 'group.collapse', { name: group.name });
  return (
    <section
      className={`group-node ${group.collapsed ? 'is-collapsed' : ''} ${selected ? 'is-selected' : ''}`}
      data-testid="group-node"
    >
      <div className="group-heading">
        <Group size={16} />
        <h3 title={group.name}>{group.name}</h3>
        <span>{group.nodeIds.length}</span>
        <Tooltip placement="top" content={toggleLabel}>
          <button
            className="icon-button small nodrag nopan"
            aria-label={toggleLabel}
            aria-expanded={!group.collapsed}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(group.id);
            }}
          >
            {group.collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
          </button>
        </Tooltip>
      </div>
      {group.collapsed && (
        <div className="group-summary">
          {unavailable > 0 ? (
            <span className="danger-text">
              <CircleAlert size={14} />
              {t('group.unavailable', { count: unavailable })}
            </span>
          ) : reading ? (
            <span>
              <LoaderCircle size={14} className="spin" />
              {t('group.reading')}
            </span>
          ) : (
            <span className={changed ? 'warning-text' : 'success-text'}>
              {changed ? <FilePenLine size={14} /> : <Check size={14} />}
              {changed ? t('group.changed', { count: changed }) : t('repository.clean')}
            </span>
          )}
        </div>
      )}
      {ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.type}
          position={positions[port.side]}
          isConnectable={false}
          style={portStyle(port.side, port.offset)}
          aria-hidden
        />
      ))}
    </section>
  );
});

const AnnotationNode = memo(function AnnotationNode({ data, selected }: NodeProps<NoteNode>) {
  const { t } = useTranslation();
  const selectedPorts = useSelectedConnectionPorts().split(',');
  const connecting = useConnection();
  const handles =
    (data.connected || (data.note.kind && data.note.kind !== 'note')) &&
    portSides.flatMap((side) =>
      (['target', 'source'] as const).map((type) => (
        <Handle
          key={`${type}-${side}`}
          id={`${type}-${side}`}
          className={selectedPorts.includes(`${type}-${side}`) ? 'is-edge-selected' : undefined}
          type={type}
          position={positions[side]}
          style={{
            ...portStyle(side, 50),
            pointerEvents: connecting.inProgress
              ? type !== connecting.fromHandle.type
                ? 'all'
                : 'none'
              : type === 'source'
                ? 'all'
                : 'none',
          }}
          aria-label={t(type === 'target' ? 'routing.input' : 'routing.output', {
            name: data.note.title,
            side: t(`routing.${side}`),
          })}
        />
      )),
    );
  if (data.note.kind && data.note.kind !== 'note')
    return (
      <>
        {handles}
        <FlowStep note={data.note} selected={selected} />
      </>
    );
  return (
    <>
      {handles}
      <article className={`note-node ${selected ? 'is-selected' : ''}`} data-testid="note-node">
        <div className="note-kind">
          <StickyNote size={14} />
          {t('note.manual')}
        </div>
        <div className="node-heading">
          <h3>{data.note.title}</h3>
          <Tooltip content={t('note.details')} placement="top">
            <button
              className="node-open icon-button nodrag nopan"
              aria-label={t('note.details')}
              onClick={(e) => {
                e.stopPropagation();
                data.onOpen(data.note.id);
              }}
            >
              <ArrowUpRight size={16} />
            </button>
          </Tooltip>
        </div>
        <p className={data.note.text ? '' : 'muted'}>{data.note.text || t('note.empty')}</p>
      </article>
    </>
  );
});

const nodeTypes = { repository: RepositoryNode, group: RepositoryGroup, note: AnnotationNode };
const edgeTypes = { relation: RepositoryRelationEdge, process: ProcessEdge };

function CanvasContents({
  board,
  repositories,
  snapshot,
  selectedRepo,
  selectedEdge,
  selectedGroup,
  selectedIds,
  onSelectRepo,
  onRepositoryState,
  onRefresh,
  onNotice,
  onSelectEdge,
  onSelectConnection,
  onEditConnection,
  onReconnect,
  onRoute,
  onEditSelection,
  onRemoveSelection,
  onSelectGroup,
  onToggleGroup,
  onConnect,
  onMove,
  onViewport,
  onAdd,
  onClear,
  onSelection,
  onSelectNote,
  onAddNote,
  onAddStep,
  onLock,
  onHistory,
  canUndo,
  canRedo,
  onGroupSelection,
}: {
  board: Board;
  repositories: Repository[];
  snapshot: Snapshot | null;
  selectedRepo: string | null;
  selectedEdge: string | null;
  selectedGroup: string | null;
  selectedIds: string[];
  onSelectRepo: (id: string) => void;
  onRepositoryState: (id: string, state: RepoState) => void;
  onRefresh: () => Promise<void>;
  onNotice: (notice: NoticeMessage, error?: boolean) => void;
  onSelectEdge: (id: string) => void;
  onSelectConnection: (id: string) => void;
  onEditConnection: (id: string) => void;
  onReconnect: (id: string, connection: Connection) => void;
  onRoute: (
    id: string,
    points: RoutePoint[] | undefined,
    ports?: { sourcePort: PortSide; targetPort: PortSide },
  ) => void;
  onEditSelection: () => void;
  onRemoveSelection: () => void;
  onSelectGroup: (id: string) => void;
  onToggleGroup: (id: string) => void;
  onConnect: (connection: Connection) => void;
  onMove: (positions: Record<string, Point>) => void;
  onViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  onAdd: () => void;
  onClear: () => void;
  onSelection: (ids: string[]) => void;
  onSelectNote: (id: string) => void;
  onAddNote: (position: Point) => void;
  onAddStep: (position: Point) => void;
  onLock: () => void;
  onHistory: (direction: 'undo' | 'redo') => void;
  canUndo: boolean;
  canRedo: boolean;
  onGroupSelection: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow();
  const flowStore = useStoreApi<CanvasNode, CanvasEdge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const shellRef = useRef<HTMLDivElement>(null);
  const reconnectingId = useRef<string | null>(null);
  const { x: viewportX, y: viewportY, zoom } = useViewport();
  const [positionDraft, setPositionDraft] = useState<{
    nodes: Board['nodes'];
    notes: Board['notes'];
    values: Record<string, Point>;
  }>({ nodes: board.nodes, notes: board.notes, values: {} });
  const localPositions =
    positionDraft.nodes === board.nodes && positionDraft.notes === board.notes
      ? positionDraft.values
      : {};
  const setPositions = useCallback(
    (recipe: (current: Record<string, Point>) => Record<string, Point>) =>
      setPositionDraft((current) => ({
        nodes: board.nodes,
        notes: board.notes,
        values: recipe(
          current.nodes === board.nodes && current.notes === board.notes ? current.values : {},
        ),
      })),
    [board.nodes, board.notes],
  );
  const [tool, setTool] = useViewState<'select' | 'pan'>(
    viewKey(board.id, 'canvas-tool'),
    'select',
    (v): v is 'select' | 'pan' => v === 'select' || v === 'pan',
  );
  const [zoomLocked, setZoomLocked] = useViewState(
    viewKey(board.id, 'canvas-zoom-lock'),
    false,
    isBoolean,
  );
  const [minimapVisible, setMinimapVisible] = useViewState(
    viewKey(board.id, 'canvas-minimap'),
    true,
    isBoolean,
  );
  const [hideFlowchart, setHideFlowchart] = useViewState(
    viewKey(board.id, 'canvas-hide-flowchart'),
    false,
    isBoolean,
  );
  const [focus, setFocus] = useViewState<{ ids: string[]; context: boolean } | null>(
    viewKey(board.id, 'canvas-focus'),
    null,
    (v): v is { ids: string[]; context: boolean } | null =>
      v === null ||
      (!!v &&
        typeof v === 'object' &&
        'ids' in v &&
        isStrings(v.ids) &&
        'context' in v &&
        isBoolean(v.context)),
  );
  const lastFocus = useRef(focus);
  const [exporting, setExporting] = useState(false);
  const [routeEditing, setRouteEditing] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  const [dimensions, setDimensions] = useState<Record<string, Size>>({});
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [dragBlocked, setDragBlocked] = useState(false);
  const resetDragFrame = useRef<number | null>(null);
  const resumeSelection = useRef(false);
  const dragCancelled = useRef(false);
  const drag = useRef<{
    ids: string[];
    origin: Point;
    board: Board;
    scene: SnapScene | null;
    locks: SnapLocks;
    raw: Point;
    bypass: boolean;
  } | null>(null);
  const previousCount = useRef(board.nodes.length + (board.notes?.length || 0));
  const positioned = board.nodes.map((n) => ({
    ...n,
    position: localPositions[n.id] || n.position,
  }));
  const positionedNotes = (board.notes || []).map((n) => ({
    ...n,
    position: localPositions[n.id] || n.position,
  }));
  const positionedBoard = { ...board, nodes: positioned, notes: positionedNotes };
  const hasFlowchart = positionedNotes.some((note) => note.kind && note.kind !== 'note') ||
    Boolean(board.connections?.length);
  const visibleConnections = hideFlowchart ? [] : (board.connections || []);
  const allGroups = board.groups || [];
  const focusedIds = focus ? selectedNodeIds(board, focus.ids) : [];
  const focusIds =
    focus && focusedIds.length
      ? focus.context
        ? flowContext([...board.edges, ...visibleConnections], focusedIds).nodeIds
        : new Set(focusedIds)
      : null;
  if (
    focus &&
    (!focusedIds.length || selectedNodeIds(board, selectedIds).some((id) => !focusIds?.has(id)))
  )
    setFocus(null);
  const groups = allGroups.filter((g) => !focusIds || g.nodeIds.every((id) => focusIds.has(id)));
  const collapsed = new Set(groups.filter((g) => g.collapsed).flatMap((g) => g.nodeIds));
  const seeds = selectedIds.length
    ? selectedNodeIds(board, selectedIds)
    : selectedRepo
      ? board.nodes.filter((n) => n.repoId === selectedRepo).map((n) => n.id)
      : groups.find((g) => g.id === selectedGroup)?.nodeIds || [];
  const context = flowContext([...board.edges, ...visibleConnections], seeds);
  const viewBoard = {
    ...board,
    groups,
    edges: board.edges.filter(
      (e) => !focusIds || (focusIds.has(e.source) && focusIds.has(e.target)),
    ),
  };
  const displayBox = (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (group) return { ...groupBounds(group, positioned, dimensions), width: 300, height: 100 };
    return {
      ...(positioned.find((n) => n.id === id)?.position || { x: 0, y: 0 }),
      ...(dimensions[id] || REPOSITORY_SIZE),
    };
  };
  const visible = visibleRelations(viewBoard).map((edge) => ({
    ...edge,
    relation: {
      ...edge.relation,
      ...relationPorts(edge.relation, displayBox(edge.source), displayBox(edge.target)),
    },
  }));
  const portVersion = visible
    .map(({ relation }) => `${relation.id}:${relation.sourcePort}:${relation.targetPort}`)
    .join(',');
  const nodes: CanvasNode[] = [
    ...groups.map((group): GroupNode => {
      const bounds = groupBounds(group, positioned, dimensions);
      const ports: GroupPort[] = [];
      if (group.collapsed)
        for (const side of portSides) {
          for (const type of ['source', 'target'] as const) {
            const edges = visible.filter(
              (e) =>
                e[type] === group.id &&
                (e.relation[type === 'source' ? 'sourcePort' : 'targetPort'] ||
                  (type === 'source' ? 'right' : 'left')) === side,
            );
            edges.forEach((e, index) =>
              ports.push({
                id: `${type}-${side}:${e.relation.id}`,
                type,
                side,
                offset: 25 + (50 * (index + 1)) / (edges.length + 1),
              }),
            );
            const flowEdges = visibleConnections.filter(
              (e) =>
                group.nodeIds.includes(e[type]) &&
                !group.nodeIds.includes(e[type === 'source' ? 'target' : 'source']) &&
                (e[type === 'source' ? 'sourcePort' : 'targetPort'] ||
                  (type === 'source' ? 'bottom' : 'top')) === side &&
                (!focusIds || (focusIds.has(e.source) && focusIds.has(e.target))),
            );
            flowEdges.forEach((e, index) =>
              ports.push({
                id: `${type}-${side}:${e.id}`,
                type,
                side,
                offset: 25 + (50 * (index + 1)) / (flowEdges.length + 1),
              }),
            );
          }
        }
      const states = board.nodes
        .filter((n) => group.nodeIds.includes(n.id))
        .map((n) => {
          const state = snapshot?.repositories[n.repoId];
          return state && !cardUsesWorktree(n.ref, state) ? { ...state, changed: 0 } : state;
        });
      return {
        id: group.id,
        type: 'group',
        position: { x: bounds.x, y: bounds.y },
        style: {
          width: group.collapsed ? 300 : bounds.width,
          height: group.collapsed ? 100 : bounds.height,
        },
        measured: dimensions[group.id],
        zIndex: 0,
        dragHandle: '.group-heading',
        connectable: false,
        selected: selectedIds.includes(group.id),
        domAttributes: { 'aria-roledescription': t('group.role') },
        ariaLabel: group.name,
        data: {
          group,
          ports,
          onToggle: onToggleGroup,
          changed: states.filter((s) => s && !s.error && s.changed).length,
          unavailable: states.filter((s) => s?.error).length,
          reading: states.some((s) => !s),
        },
      };
    }),
    ...positioned
      .filter((n) => !collapsed.has(n.id) && (!focusIds || focusIds.has(n.id)))
      .map((node): RepoNode => {
        const registered = repositories.find((r) => r.id === node.repoId)!;
        const repo = node.displayName ? { ...registered, name: node.displayName } : registered;
        return {
          id: node.id,
          type: 'repository',
          position: node.position,
          measured: dimensions[node.id],
          zIndex: 2,
          domAttributes: { 'aria-roledescription': t('canvas.nodeRole') },
          ariaLabel: t('repository.details', {
            name: node.ref ? `${repo.name} · ${cardRefLabel(node.ref)}` : repo.name,
          }),
          selected: selectedIds.includes(node.id),
          className: seeds.length && context.nodeIds.has(node.id) ? 'context-related' : undefined,
          data: {
            repo,
            state: snapshot?.repositories[node.repoId],
            ref: node.ref,
            onOpen: onSelectRepo,
            boardId: board.id,
            onState: onRepositoryState,
            onRefresh,
            onNotice,
          },
        };
      }),
    ...positionedNotes
      .filter((note) => !hideFlowchart || !note.kind || note.kind === 'note')
      .filter((n) => !focusIds || focusIds.has(n.id))
      .map((note): NoteNode => ({
        id: note.id,
        type: 'note',
        position: note.position,
        measured: dimensions[note.id],
        zIndex: 2,
        selected: selectedIds.includes(note.id),
        connectable:
          (!!note.kind && note.kind !== 'note') ||
          visibleConnections.some((c) => c.source === note.id || c.target === note.id),
        domAttributes: {
          'aria-roledescription': t(
            note.kind && note.kind !== 'note' ? 'flowchart.role' : 'note.role',
          ),
        },
        ariaLabel: note.title,
        data: {
          note,
          connected: visibleConnections.some((c) => c.source === note.id || c.target === note.id),
          onOpen: onSelectNote,
        },
      })),
  ];
  const parallel = new Map<string, string[]>();
  for (const e of visible) {
    const key = JSON.stringify([
      e.source,
      e.target,
      e.relation.sourcePort || 'right',
      e.relation.targetPort || 'left',
    ]);
    parallel.set(key, [...(parallel.get(key) || []), e.relation.id]);
  }
  const edges: CanvasEdge[] = visible.map(({ relation, source, target }): RelationEdge => {
    const focused = seeds.length > 0 && context.edgeIds.has(relation.id);
    const siblings = parallel.get(
      JSON.stringify([
        source,
        target,
        relation.sourcePort || 'right',
        relation.targetPort || 'left',
      ]),
    )!;
    return {
      id: relation.id,
      source,
      target,
      type: 'relation',
      reconnectable: false,
      zIndex: 1,
      sourceHandle: `source-${relation.sourcePort || 'right'}${source === relation.source ? '' : `:${relation.id}`}`,
      targetHandle: `target-${relation.targetPort || 'left'}${target === relation.target ? '' : `:${relation.id}`}`,
      domAttributes: { 'aria-roledescription': t('canvas.edgeRole') },
      ariaLabel: t('canvas.edge', {
        source:
          repositories.find(
            (r) => r.id === board.nodes.find((n) => n.id === relation.source)?.repoId,
          )?.name || relation.source,
        target:
          repositories.find(
            (r) => r.id === board.nodes.find((n) => n.id === relation.target)?.repoId,
          )?.name || relation.target,
      }),
      className: focused ? 'context-related' : undefined,
      selected: relation.id === selectedEdge,
      data: {
        editing:
          routeEditing === relation.id &&
          selectedEdge === relation.id &&
          tool === 'select' &&
          !board.layoutLocked &&
          source === relation.source &&
          target === relation.target,
        onRoute: (id, points) =>
          onRoute(
            id,
            points,
            points?.length
              ? { sourcePort: relation.sourcePort!, targetPort: relation.targetPort! }
              : undefined,
          ),
        relation,
        result: snapshot?.relations[relation.id],
        focused,
        onOpen: onSelectEdge,
        labelOffset: (siblings.indexOf(relation.id) - (siblings.length - 1) / 2) * 30,
      },
    };
  });
  for (const connection of visibleConnections) {
    const sourceGroup = groups.find((g) => g.collapsed && g.nodeIds.includes(connection.source));
    const targetGroup = groups.find((g) => g.collapsed && g.nodeIds.includes(connection.target));
    const source = sourceGroup?.id || connection.source;
    const target = targetGroup?.id || connection.target;
    if (
      source === target ||
      !nodes.some((n) => n.id === source) ||
      !nodes.some((n) => n.id === target)
    )
      continue;
    edges.push({
      id: connection.id,
      source,
      target,
      type: 'process',
      reconnectable:
        selectedEdge === connection.id &&
        tool === 'select' &&
        !board.layoutLocked &&
        !sourceGroup &&
        !targetGroup,
      zIndex: 1,
      sourceHandle: `source-${connection.sourcePort || 'bottom'}${sourceGroup ? `:${connection.id}` : ''}`,
      targetHandle: `target-${connection.targetPort || 'top'}${targetGroup ? `:${connection.id}` : ''}`,
      selected: selectedEdge === connection.id,
      ariaLabel: connection.label || t('flowchart.connection'),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--edge-neutral)',
        width: 18,
        height: 18,
      },
      data: {
        connection,
        focused: context.edgeIds.has(connection.id),
        onOpen: onEditConnection,
        editing:
          routeEditing === connection.id &&
          selectedEdge === connection.id &&
          tool === 'select' &&
          !board.layoutLocked &&
          !sourceGroup &&
          !targetGroup,
        onRoute,
      },
    });
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      updateNodeInternals([
        ...board.nodes.map((n) => n.id),
        ...(board.notes || []).map((n) => n.id),
        ...(board.groups || []).map((g) => g.id),
      ]),
    );
    return () => cancelAnimationFrame(frame);
  }, [
    board.nodes,
    board.notes,
    board.groups,
    board.edges,
    board.connections,
    portVersion,
    focus,
    updateNodeInternals,
  ]);
  useEffect(() => {
    const count = board.nodes.length + (board.notes?.length || 0);
    if (!zoomLocked && count && (previousCount.current !== count || !board.viewport)) {
      const frame = requestAnimationFrame(() => void fitView({ padding: 0.22, maxZoom: 1 }));
      previousCount.current = count;
      return () => cancelAnimationFrame(frame);
    }
    previousCount.current = count;
  }, [board.nodes.length, board.notes?.length, board.viewport, fitView, zoomLocked]);
  useEffect(() => {
    if (lastFocus.current === focus) return;
    lastFocus.current = focus;
    if (zoomLocked) return;
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.22, maxZoom: 1 }));
    return () => cancelAnimationFrame(frame);
  }, [focus, zoomLocked, fitView]);

  const handleChanges = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const selections = changes.filter((change) => change.type === 'select');
      if (selections.length) {
        const ids = new Set(selectedIds);
        for (const change of selections) {
          if (change.type !== 'select') continue;
          if (change.selected) ids.add(change.id);
          else ids.delete(change.id);
        }
        onSelection([...ids]);
      }
      const measured = changes.filter(
        (change) => change.type === 'dimensions' && change.dimensions,
      );
      if (measured.length)
        setDimensions((current) => {
          let next = current;
          for (const change of measured) {
            if (change.type !== 'dimensions' || !change.dimensions) continue;
            const previous = current[change.id];
            if (
              previous?.width === change.dimensions.width &&
              previous?.height === change.dimensions.height
            )
              continue;
            if (next === current) next = { ...current };
            next[change.id] = change.dimensions;
          }
          return next;
        });
      const moved = changes.filter((change) => change.type === 'position' && change.position);
      if (moved.length && !board.layoutLocked && !drag.current && !dragCancelled.current)
        setPositions((current) => {
          const next = { ...current };
          for (const change of moved) {
            if (change.type !== 'position' || !change.position) continue;
            if ([...board.nodes, ...(board.notes || [])].some((n) => n.id === change.id)) {
              next[change.id] = {
                x: Math.max(-100000, Math.min(100000, change.position.x)),
                y: Math.max(-100000, Math.min(100000, change.position.y)),
              };
            }
          }
          return next;
        });
    },
    [board.nodes, board.notes, board.layoutLocked, onSelection, selectedIds, setPositions],
  );

  const previewDrag = useCallback(
    (raw: Point, bypass: boolean) => {
      const gesture = drag.current;
      if (!gesture) return null;
      gesture.raw = raw;
      gesture.bypass = bypass;
      const snapped =
        preferences.snappingEnabled && !bypass && gesture.scene
          ? snapMove(gesture.scene, raw, zoom, gesture.locks)
          : { delta: raw, locks: {}, guides: [] };
      gesture.locks = snapped.locks;
      const next = moveSelection(gesture.board, gesture.ids, snapped.delta);
      setPositions((current) => ({ ...current, ...next }));
      setSnapGuides(snapped.guides);
      return next;
    },
    [preferences.snappingEnabled, zoom, setPositions],
  );

  const cancelDrag = useCallback(() => {
    const gesture = drag.current;
    if (!gesture) return;
    // React Flow does not emit drag-stop after a multitouch abort. Ignore its
    // trailing raw position changes until the next gesture starts.
    dragCancelled.current = true;
    drag.current = null;
    // Reset both NodeWrapper and NodesSelection drag handlers after an abort.
    resumeSelection.current = flowStore.getState().nodesSelectionActive;
    flowStore.setState({ nodesSelectionActive: false });
    setDragBlocked(true);
    const original = moveSelection(gesture.board, gesture.ids, { x: 0, y: 0 });
    setPositions((current) => ({ ...current, ...original }));
    setSnapGuides([]);
  }, [setPositions, flowStore]);

  useEffect(() => {
    const handleAlt = (event: KeyboardEvent) => {
      const gesture = drag.current;
      if (event.key === 'Alt' && gesture && gesture.bypass !== event.altKey)
        previewDrag(gesture.raw, event.altKey);
    };
    const hide = () => {
      if (document.hidden) cancelDrag();
    };
    const release = () => {
      if (!dragCancelled.current || resetDragFrame.current !== null) return;
      resetDragFrame.current = requestAnimationFrame(() => {
        resetDragFrame.current = null;
        setDragBlocked(false);
        if (resumeSelection.current) {
          flowStore.setState({ nodesSelectionActive: true });
          resumeSelection.current = false;
        }
      });
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) cancelDrag();
    };
    const touchEnd = (event: TouchEvent) => {
      if (!event.touches.length) release();
    };
    const touchCancel = (event: TouchEvent) => {
      cancelDrag();
      touchEnd(event);
    };
    window.addEventListener('keydown', handleAlt);
    window.addEventListener('keyup', handleAlt);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('focus', release);
    window.addEventListener('mouseup', release, true);
    window.addEventListener('touchstart', touchStart, true);
    window.addEventListener('touchend', touchEnd, true);
    window.addEventListener('touchcancel', touchCancel, true);
    window.addEventListener('pointercancel', cancelDrag, true);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('keydown', handleAlt);
      window.removeEventListener('keyup', handleAlt);
      window.removeEventListener('blur', cancelDrag);
      window.removeEventListener('focus', release);
      window.removeEventListener('mouseup', release, true);
      window.removeEventListener('touchstart', touchStart, true);
      window.removeEventListener('touchend', touchEnd, true);
      window.removeEventListener('touchcancel', touchCancel, true);
      window.removeEventListener('pointercancel', cancelDrag, true);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [previewDrag, cancelDrag, flowStore]);

  useEffect(
    () => () => {
      if (resetDragFrame.current !== null) cancelAnimationFrame(resetDragFrame.current);
    },
    [],
  );

  async function exportCanvas(format: 'svg' | 'png') {
    if (exporting || !shellRef.current) return;
    setExporting(true);
    setExportError(false);
    try {
      await document.fonts.ready;
      const styles = getComputedStyle(shellRef.current);
      const colors = Object.fromEntries(
        Object.entries({
          canvas: '--canvas',
          surface: '--surface',
          group: '--sidebar',
          text: '--text',
          muted: '--muted',
          border: '--border-strong',
          edge: '--edge-neutral',
          success: '--green',
          warning: '--orange',
          danger: '--danger',
        }).map(([key, token]) => [key, styles.getPropertyValue(token).trim()]),
      ) as ExportColors;
      const scene: ExportScene = {
        title: board.name,
        nodes: nodes.map((node) => {
          const fallback = node.type === 'note' ? noteSize(node.data.note) : REPOSITORY_SIZE;
          const base = {
            id: node.id,
            position: node.position,
            width: Number(node.style?.width) || dimensions[node.id]?.width || fallback.width,
            height: Number(node.style?.height) || dimensions[node.id]?.height || fallback.height,
          };
          if (node.type === 'group')
            return {
              ...base,
              kind: 'group',
              title: node.data.group.name,
              subtitle: String(node.data.group.nodeIds.length),
              lines: node.data.group.collapsed
                ? [
                    node.data.unavailable
                      ? t('group.unavailable', { count: node.data.unavailable })
                      : node.data.reading
                        ? t('group.reading')
                        : node.data.changed
                          ? t('group.changed', { count: node.data.changed })
                          : t('repository.clean'),
                  ]
                : [],
              tone: node.data.unavailable ? 'danger' : node.data.changed ? 'warning' : 'success',
            };
          if (node.type === 'note')
            return {
              ...base,
              kind: 'note',
              title: node.data.note.title,
              subtitle: t('note.manual'),
              lines: [
                node.data.note.kind && node.data.note.kind !== 'note'
                  ? node.data.note.summary || ''
                  : node.data.note.text || t('note.empty'),
              ],
              shape: node.data.note.kind,
            };
          const state = node.data.state;
          const conflicts = state?.files.filter((f) => f.conflicted).length || 0;
          const reference = node.data.ref;
          const showWorktree = cardUsesWorktree(reference, state);
          const missing =
            !!reference &&
            !!state &&
            !state.branches.some((branch) => branchRef(branch) === reference);
          const status = state?.error
            ? t('repository.unavailable')
            : !state
              ? t('repository.reading')
              : missing
                ? t('repositoryCard.refMissing')
                : !showWorktree
                  ? ''
                  : conflicts
                    ? t('repository.conflicts', { count: conflicts })
                    : state.changed
                      ? t('repository.changes', { count: state.changed })
                      : t('repository.clean');
          const sync = [
            state?.ahead ? t('repository.aheadCount', { value: state.ahead }) : '',
            state?.behind ? t('repository.behindCount', { value: state.behind }) : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return {
            ...base,
            kind: 'repository',
            title: node.data.repo.name,
            subtitle: reference
              ? cardRefLabel(reference)
              : !state || state.error
                ? ''
                : state.detached
                  ? t('repository.detached')
                  : state.branch || t('repository.unknownBranch'),
            lines: [status, ...(showWorktree ? [sync] : [])].filter(Boolean),
            tone:
              state?.error || missing || (showWorktree && conflicts)
                ? 'danger'
                : showWorktree && state?.changed
                  ? 'warning'
                  : 'success',
          };
        }),
        edges: [],
      };
      const paths = [
        ...shellRef.current.querySelectorAll<SVGPathElement>(
          '.workflow-edge-path, .process-edge-path',
        ),
      ];
      const labels = [...shellRef.current.querySelectorAll<HTMLButtonElement>('.edge-label')];
      for (const edge of edges) {
        const path = paths.find((p) => p.id === edge.id);
        const label = labels.find((l) => l.dataset.edgeId === edge.id);
        if (!path || !label || !edge.data) continue;
        if (edge.type === 'process') {
          const box = path.getBBox();
          const labelBox = label.getBoundingClientRect();
          const position = screenToFlowPosition(
            { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 },
            { snapToGrid: false },
          );
          scene.edges.push({
            id: edge.id,
            path: path.getAttribute('d') || '',
            bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
            position,
            width: label.offsetWidth,
            label: edge.data.connection.label,
            kind: 'process',
            status: '',
          });
          continue;
        }
        if (!('relation' in edge.data)) continue;
        const { relation, result } = edge.data;
        const box = path.getBBox();
        const labelBox = label.getBoundingClientRect();
        const labelPosition = screenToFlowPosition(
          { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 },
          { snapToGrid: false },
        );
        scene.edges.push({
          id: edge.id,
          path: path.getAttribute('d') || '',
          bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
          position: labelPosition,
          width: label.offsetWidth,
          label: relation.label || t(`relation.${relation.kind}`),
          kind: relation.kind,
          status: relationStatus(t, relation, result),
          tone:
            result?.state === 'integrated'
              ? 'success'
              : result?.state === 'pending'
                ? 'warning'
                : undefined,
        });
      }
      await Promise.all(
        scene.nodes.map(async (node) => {
          if (node.kind !== 'repository') return;
          const item = nodes.find((item) => item.id === node.id);
          const repo = item?.type === 'repository' ? item.data.repo : undefined;
          if (repo) node.logoDataUrl = await repositoryImage(repo).catch(() => undefined);
        }),
      );
      await downloadBoard(scene, colors, format);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className={`canvas-shell reveal-node-handles ${tool === 'pan' ? 'is-pan-tool' : ''} ${board.layoutLocked ? 'is-layout-locked' : ''}`}
      ref={shellRef}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          cancelDrag();
          return;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === 'a' &&
          event.target instanceof HTMLElement &&
          event.target.closest('.react-flow') &&
          !event.target.closest('input,textarea,[contenteditable="true"]')
        ) {
          event.preventDefault();
          onSelection(
            nodes.filter((n) => n.type !== 'group' || n.data.group.collapsed).map((n) => n.id),
          );
          return;
        }
        if (
          event.key === 'Escape' &&
          event.target instanceof HTMLElement &&
          event.target.closest('.react-flow')
        ) {
          onClear();
        }
        if (
          !(event.target instanceof HTMLElement) ||
          (!event.target.classList.contains('react-flow__node') &&
            !event.target.classList.contains('react-flow__nodesselection-rect')) ||
          event.altKey ||
          event.metaKey ||
          event.ctrlKey
        )
          return;
        const nodeId = event.target.getAttribute('data-id');
        const selectionRect = event.target.classList.contains('react-flow__nodesselection-rect');
        const node = board.nodes.find((n) => n.id === nodeId);
        const group = groups.find((g) => g.id === nodeId);
        const note = board.notes?.find((n) => n.id === nodeId);
        if (!node && !group && !note && !selectionRect) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          if (group) onSelectGroup(group.id);
          else if (node) onSelectRepo(node.id);
          else if (note) onSelectNote(note.id);
          return;
        }
        const direction = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        }[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        if (board.layoutLocked || tool === 'pan') return;
        const step = event.shiftKey ? 50 : 10;
        const next = moveSelection(
          positionedBoard,
          selectionRect || (nodeId && selectedIds.includes(nodeId)) ? selectedIds : [nodeId!],
          {
            x: direction[0] * step,
            y: direction[1] * step,
          },
        );
        setPositions((current) => ({ ...current, ...next }));
        onMove(next);
      }}
    >
      <ReactFlow<CanvasNode, CanvasEdge>
        colorMode={preferences.theme}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleChanges}
        onEdgesChange={(changes) => {
          const selected = changes.find((change) => change.type === 'select' && change.selected);
          if (selected?.type === 'select') {
            if (board.connections?.some((connection) => connection.id === selected.id))
              onSelectConnection(selected.id);
            else if (board.edges.some((edge) => edge.id === selected.id)) onSelectEdge(selected.id);
          }
        }}
        onConnect={onConnect}
        edgesReconnectable={false}
        reconnectRadius={9}
        onReconnectStart={(_event, edge) => {
          reconnectingId.current = edge.id;
        }}
        onReconnectEnd={() => {
          reconnectingId.current = null;
        }}
        onReconnect={(edge, connection) => {
          if (tool === 'select' && edge.type === 'process') onReconnect(edge.id, connection);
        }}
        isValidConnection={(connection) => {
          if (tool !== 'select' || board.layoutLocked) return false;
          if (reconnectingId.current)
            return !!reconnectedFlowConnection(board, reconnectingId.current, {
              ...connection,
              sourceHandle: connection.sourceHandle || null,
              targetHandle: connection.targetHandle || null,
            });
          const endpoints = [...board.nodes, ...(board.notes || [])];
          return (
            connection.source !== connection.target &&
            endpoints.some((n) => n.id === connection.source) &&
            endpoints.some((n) => n.id === connection.target)
          );
        }}
        onNodeClick={(event, node) => {
          if (event.shiftKey || event.ctrlKey || event.metaKey) return;
          onSelection([node.id]);
        }}
        onEdgeClick={(_e, edge) =>
          edge.type === 'process' ? onSelectConnection(edge.id) : onSelectEdge(edge.id)
        }
        onNodeDragStart={(event, node, dragged) => {
          dragCancelled.current = false;
          const ids = [...new Set([node.id, ...dragged.map((n) => n.id)])];
          const initial = structuredClone(positionedBoard);
          drag.current = {
            ids,
            origin: nodes.find((candidate) => candidate.id === node.id)!.position,
            board: initial,
            scene: createSnapScene(
              initial,
              ids,
              dimensions,
              nodes.map((n) => n.id),
            ),
            locks: {},
            raw: { x: 0, y: 0 },
            bypass: 'altKey' in event && event.altKey,
          };
        }}
        onNodeDrag={(event, node) => {
          const gesture = drag.current;
          if (!gesture) return;
          previewDrag(
            {
              x: node.position.x - gesture.origin.x,
              y: node.position.y - gesture.origin.y,
            },
            'altKey' in event && event.altKey,
          );
        }}
        onNodeDragStop={(event, node) => {
          const gesture = drag.current;
          if (!gesture) return;
          const next = previewDrag(
            {
              x: node.position.x - gesture.origin.x,
              y: node.position.y - gesture.origin.y,
            },
            'altKey' in event && event.altKey,
          );
          drag.current = null;
          setSnapGuides([]);
          if (next) onMove(next);
        }}
        onMoveEnd={(_e, viewport) => {
          onViewport(viewport);
        }}
        onPaneClick={onClear}
        defaultViewport={board.viewport}
        fitView={!board.viewport}
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
        minZoom={zoomLocked ? zoom : 0.25}
        maxZoom={zoomLocked ? zoom : 1.6}
        deleteKeyCode={null}
        panOnScroll
        nodesDraggable={tool === 'select' && !board.layoutLocked && !dragBlocked}
        autoPanOnNodeDrag={!dragBlocked}
        nodesConnectable={tool === 'select' && !board.layoutLocked}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        panOnDrag={tool === 'pan' ? true : [1, 2]}
        zoomOnScroll={!zoomLocked}
        zoomOnPinch={!zoomLocked}
        zoomOnDoubleClick={false}
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect={false}
        proOptions={{ hideAttribution: true }}
        connectionRadius={30}
        aria-label={t('canvas.label')}
        ariaLabelConfig={{
          'node.a11yDescription.default':
            t('canvas.nodeInstructions') + ' ' + t('group.instructions'),
          'node.a11yDescription.keyboardDisabled': t('canvas.movableInstructions'),
          'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) =>
            t('canvas.nodeMoved', {
              direction:
                direction === 'up' ||
                direction === 'down' ||
                direction === 'left' ||
                direction === 'right'
                  ? t(`canvas.${direction}`)
                  : direction,
              x,
              y,
            }),
          'edge.a11yDescription.default': t('canvas.edgeInstructions'),
          'controls.ariaLabel': t('canvas.controls'),
          'controls.zoomIn.ariaLabel': t('canvas.zoomIn'),
          'controls.zoomOut.ariaLabel': t('canvas.zoomOut'),
          'controls.fitView.ariaLabel': t('canvas.fit'),
          'controls.interactive.ariaLabel': t('canvas.interactive'),
          'minimap.ariaLabel': t('canvas.minimap'),
          'handle.ariaLabel': t('canvas.handle'),
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--dot)" />
      </ReactFlow>
      {snapGuides.length > 0 && (
        <svg className="snap-guides" aria-hidden="true">
          <g transform={`translate(${viewportX}, ${viewportY}) scale(${zoom})`}>
            {snapGuides.map((guide, index) => (
              <g key={index}>
                <line
                  x1={guide.x1}
                  y1={guide.y1}
                  x2={guide.x2}
                  y2={guide.y2}
                  vectorEffect="non-scaling-stroke"
                />
                {guide.kind === 'gap' && (
                  <path
                    d={
                      guide.y1 === guide.y2
                        ? `M ${guide.x1} ${guide.y1 - 3 / zoom} v ${6 / zoom} M ${guide.x2} ${guide.y2 - 3 / zoom} v ${6 / zoom}`
                        : `M ${guide.x1 - 3 / zoom} ${guide.y1} h ${6 / zoom} M ${guide.x2 - 3 / zoom} ${guide.y2} h ${6 / zoom}`
                    }
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            ))}
          </g>
        </svg>
      )}
      {board.nodes.length === 0 && !board.notes?.length && (
        <div className="empty-canvas">
          <div className="empty-illustration">
            <span className="empty-mini-node">
              <FolderGit2 size={23} />
            </span>
            <span className="empty-connector">
              <i />
              <i />
              <i />
            </span>
            <span className="empty-mini-node second">
              <GitBranch size={23} />
            </span>
          </div>
          <h1>{t('canvas.emptyTitle')}</h1>
          <button className="button primary" onClick={onAdd}>
            <Plus size={17} />
            {t('canvas.first')}
          </button>
        </div>
      )}
      <CanvasTools
        tool={tool}
        onTool={setTool}
        locked={!!board.layoutLocked}
        onLock={onLock}
        snappingEnabled={preferences.snappingEnabled}
        onSnapping={() => updatePreferences({ snappingEnabled: !preferences.snappingEnabled })}
        canUndo={canUndo}
        canRedo={canRedo}
        onHistory={onHistory}
        count={selectedIds.length + (selectedEdge ? 1 : 0)}
        onEdit={
          selectedEdge ||
          (selectedIds.length === 1 &&
            (board.groups?.some((group) => group.id === selectedIds[0]) ||
              (!board.layoutLocked && board.nodes.some((node) => node.id === selectedIds[0])) ||
              board.notes?.some((note) => note.id === selectedIds[0])))
            ? onEditSelection
            : undefined
        }
        editLabel={t(
          selectedEdge && board.connections?.some((c) => c.id === selectedEdge)
            ? 'flowchart.connection'
            : selectedEdge
              ? 'relation.edit'
              : selectedGroup
                ? 'group.edit'
                : board.nodes.some((node) => node.id === selectedIds[0])
                  ? 'repositoryCard.bindBranch'
                  : 'note.details',
        )}
        onRemove={onRemoveSelection}
        selectionActions={
          selectedEdge
            ? (() => {
                const edge =
                  board.edges.find((e) => e.id === selectedEdge) ||
                  board.connections?.find((e) => e.id === selectedEdge);
                if (!edge) return null;
                const projected = groups.some(
                  (g) =>
                    g.collapsed &&
                    (g.nodeIds.includes(edge.source) || g.nodeIds.includes(edge.target)),
                );
                return (
                  <>
                    <IconButton
                      className="canvas-tool"
                      label={t('routing.editRoute')}
                      aria-pressed={routeEditing === selectedEdge}
                      disabled={!!board.layoutLocked || tool !== 'select' || projected}
                      onClick={() =>
                        setRouteEditing((current) =>
                          current === selectedEdge ? null : selectedEdge,
                        )
                      }
                    >
                      <Route size={17} />
                    </IconButton>
                    {edge.waypoints?.length ? (
                      <IconButton
                        className="canvas-tool"
                        label={t('routing.resetRoute')}
                        disabled={!!board.layoutLocked || tool !== 'select' || projected}
                        onClick={() => onRoute(selectedEdge, undefined)}
                      >
                        <RotateCcw size={17} />
                      </IconButton>
                    ) : null}
                  </>
                );
              })()
            : null
        }
        unitCount={selectionUnits(board, selectedIds).length}
        canGroup={
          selectedNodeIds(board, selectedIds).filter((id) => board.nodes.some((n) => n.id === id))
            .length > 1
        }
        onGroup={() => onGroupSelection(selectedNodeIds(board, selectedIds))}
        onArrange={(kind) => onMove(arrangeSelection(board, selectedIds, kind, dimensions))}
        onNote={() => {
          const rect = shellRef.current!.getBoundingClientRect();
          onAddNote(
            screenToFlowPosition({
              x: rect.x + rect.width / 2 - 138,
              y: rect.y + rect.height / 2 - 90,
            }),
          );
        }}
        onStep={() => {
          const rect = shellRef.current!.getBoundingClientRect();
          onAddStep(
            screenToFlowPosition({
              x: rect.x + rect.width / 2 - 130,
              y: rect.y + rect.height / 2 - 53,
            }),
          );
        }}
        onFocus={(context) => setFocus({ ids: selectedIds, context })}
        focused={!!focusIds}
        onExitFocus={() => setFocus(null)}
        onExport={(format) => void exportCanvas(format)}
        exporting={exporting}
        exportError={exportError}
        hasNodes={nodes.length > 0}
      />
      <div className="canvas-bottom">
        <div className="canvas-tools">
          <Tooltip placement="top" content={t('canvas.zoomOut')}>
            <button
              className="canvas-tool"
              aria-label={t('canvas.zoomOut')}
              disabled={zoomLocked}
              onClick={() => void zoomOut({ duration: 150 })}
            >
              <Minus size={16} />
            </button>
          </Tooltip>
          <span className="canvas-zoom-label">{Math.round(zoom * 100)}%</span>
          <Tooltip placement="top" content={t('canvas.zoomIn')}>
            <button
              className="canvas-tool"
              aria-label={t('canvas.zoomIn')}
              disabled={zoomLocked}
              onClick={() => void zoomIn({ duration: 150 })}
            >
              <Plus size={16} />
            </button>
          </Tooltip>
          <Tooltip placement="top" content={t('canvas.fit')}>
            <button
              className="canvas-tool"
              aria-label={t('canvas.fit')}
              disabled={zoomLocked}
              onClick={() => void fitView({ padding: 0.22, maxZoom: 1, duration: 200 })}
            >
              <Expand size={16} />
            </button>
          </Tooltip>
          <Tooltip placement="top" content={t(zoomLocked ? 'tools.unlockZoom' : 'tools.lockZoom')}>
            <button
              className="canvas-tool"
              aria-label={t(zoomLocked ? 'tools.unlockZoom' : 'tools.lockZoom')}
              aria-pressed={zoomLocked}
              onClick={() => setZoomLocked((value) => !value)}
            >
              {zoomLocked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}
            </button>
          </Tooltip>
          {(hasFlowchart || hideFlowchart) && (
            <Tooltip placement="right" content={t(hideFlowchart ? 'canvas.showFlowchart' : 'canvas.hideFlowchart')}>
              <button
                type="button"
                className="canvas-tool"
                aria-label={t('canvas.hideFlowchart')}
                aria-pressed={hideFlowchart}
                onClick={() => {
                  if (!hideFlowchart) {
                    setFocus(null);
                    const remaining = selectedIds.filter((id) => !positionedNotes.some(
                      (note) => note.id === id && note.kind && note.kind !== 'note',
                    ));
                    if (remaining.length !== selectedIds.length ||
                      visibleConnections.some((connection) => connection.id === selectedEdge))
                      onSelection(remaining);
                  }
                  setHideFlowchart(!hideFlowchart);
                }}
              >
                {hideFlowchart ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </Tooltip>
          )}
          <Tooltip placement="right" content={t('canvas.minimap')}>
            <button
              type="button"
              className="canvas-tool"
              aria-label={t('canvas.minimap')}
              aria-pressed={minimapVisible}
              onClick={() => setMinimapVisible((value) => !value)}
            >
              <MapIcon size={16} />
            </button>
          </Tooltip>
        </div>
        {minimapVisible && nodes.length > 0 && (
          <MiniMap
            className="canvas-minimap"
            style={{ width: 125, height: 82 }}
            pannable
            zoomable={!zoomLocked}
            position="bottom-left"
            bgColor="var(--surface)"
            nodeColor="var(--minimap-node)"
            maskColor="var(--minimap-mask)"
            maskStrokeColor="var(--border-strong)"
            maskStrokeWidth={1}
            ariaLabel={t('canvas.minimap')}
          />
        )}
      </div>
    </div>
  );
}

export function FlowCanvas(props: Parameters<typeof CanvasContents>[0]) {
  return (
    <ReactFlowProvider>
      <CanvasContents {...props} />
    </ReactFlowProvider>
  );
}
