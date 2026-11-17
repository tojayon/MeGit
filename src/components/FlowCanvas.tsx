import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import { repositoryImage } from '../lib/repository-images';
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type NodeChange,
  SelectionMode,
} from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Expand,
  FilePenLine,
  FolderGit2,
  GitBranch,
  GitMerge,
  Group,
  Link2,
  LoaderCircle,
  Minus,
  Plus,
  LockKeyhole,
  UnlockKeyhole,
  StickyNote,
} from 'lucide-react';
import type {
  Board,
  FlowEdge as Relation,
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
  type Point,
  type Size,
} from '../lib/whiteboard';
import { Tooltip } from './Tooltip';
import { portSides } from './RelationAppearance';
import { CanvasTools } from './CanvasTools';
import { downloadBoard, type ExportColors, type ExportScene } from '../lib/board-export';
import { NOTE_SIZE, REPOSITORY_SIZE } from '../lib/whiteboard';

type RepoNode = Node<
  {
    repo: Repository;
    state?: RepoState;
    onOpen: (id: string) => void;
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
type NoteNode = Node<{ note: FlowNote; onOpen: (id: string) => void }, 'note'>;
type CanvasNode = RepoNode | GroupNode | NoteNode;
type RelationEdge = Edge<
  {
    relation: Relation;
    result?: Snapshot['relations'][string];
    focused: boolean;
    labelOffset: number;
    onOpen: (id: string) => void;
  },
  'relation'
>;
const positions = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function portStyle(side: PortSide, offset: number): CSSProperties {
  return side === 'top' || side === 'bottom' ? { left: `${offset}%` } : { top: `${offset}%` };
}

const RepositoryNode = memo(function RepositoryNode({ data, selected }: NodeProps<RepoNode>) {
  const { t } = useTranslation();
  const { repo, state, onOpen } = data;
  const conflicts = state?.files.filter((f) => f.conflicted).length || 0;
  return (
    <article
      className={`repository-node ${selected ? 'is-selected' : ''}`}
      data-testid="repository-node"
    >
      {portSides.flatMap((side) =>
        (['target', 'source'] as const).map((type) => (
          <Handle
            key={`${type}-${side}`}
            id={`${type}-${side}`}
            type={type}
            position={positions[side]}
            style={portStyle(side, type === 'target' ? 43 : 57)}
            aria-label={t(type === 'target' ? 'routing.input' : 'routing.output', {
              name: repo.name,
              side: t(`routing.${side}`),
            })}
          />
        )),
      )}
      <div className="node-heading">
        <div className="repo-symbol">
          <RepositoryAvatar repo={repo} />
        </div>
        <div className="node-name">
          <h3 title={repo.name}>{repo.name}</h3>
        </div>
        <Tooltip content={t('repository.viewNamed', { name: repo.name })} placement="top">
          <button
            className="node-open icon-button nodrag nopan"
            aria-label={t('repository.viewNamed', { name: repo.name })}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(repo.id);
            }}
          >
            <ArrowUpRight size={16} />
          </button>
        </Tooltip>
      </div>
      {state?.error ? (
        <p className="node-error">
          <CircleAlert size={15} />
          {t('repository.unavailable')}
        </p>
      ) : state ? (
        <>
          <div className="node-branch">
            <GitBranch size={14} />
            <span title={state.branch}>
              {state.detached
                ? t('repository.detached')
                : state.branch || t('repository.unknownBranch')}
            </span>
          </div>
          <div className="node-stats">
            <span className={conflicts ? 'conflicted' : state.changed ? 'modified' : ''}>
              {conflicts ? (
                <CircleAlert size={14} />
              ) : state.changed ? (
                <FilePenLine size={14} />
              ) : (
                <Check size={14} />
              )}
              {conflicts
                ? t('repository.conflicts', { count: conflicts })
                : state.changed
                  ? t('repository.changes', { count: state.changed })
                  : t('repository.clean')}
            </span>
            <div>
              {!!state.ahead && (
                <span aria-label={t('repository.aheadCount', { value: state.ahead })}>
                  <ArrowUp size={13} />
                  {state.ahead}
                </span>
              )}
              {!!state.behind && (
                <span aria-label={t('repository.behindCount', { value: state.behind })}>
                  <ArrowDown size={13} />
                  {state.behind}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="node-loading">
          <LoaderCircle size={15} className="spin" />
          {t('repository.reading')}
        </div>
      )}
    </article>
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

const WorkflowEdge = memo(function WorkflowEdge({
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
}: EdgeProps<RelationEdge>) {
  const { t } = useTranslation();
  if (!data) return null;
  const { relation, result, focused, labelOffset } = data;
  const options = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [edgePath, labelX, labelY] =
    relation.routing === 'bezier'
      ? getBezierPath(options)
      : relation.routing === 'straight'
        ? getStraightPath(options)
        : getSmoothStepPath({
            ...options,
            borderRadius: relation.routing === 'step' ? 0 : 14,
            offset: 32,
          });
  const status =
    relation.kind === 'integration'
      ? result?.state === 'integrated'
        ? t('relation.included')
        : result?.state === 'pending'
          ? t('relation.pending', { count: result.pending ?? 0 })
          : t('relation.unknown')
      : t('relation.flow');
  return (
    <>
      <BaseEdge
        className="workflow-edge-path"
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={
          {
            '--relation-stroke':
              selected || focused
                ? 'var(--accent)'
                : relation.kind === 'integration'
                  ? 'var(--edge-integration)'
                  : 'var(--edge-neutral)',
            '--relation-width': selected ? 2.6 : focused ? 2.2 : 1.5,
            strokeDasharray: relation.kind === 'integration' ? undefined : '5 5',
          } as CSSProperties
        }
        interactionWidth={22}
      />
      <EdgeLabelRenderer>
        <button
          className={`edge-label nodrag nopan ${selected ? 'selected' : ''} ${focused ? 'context-related' : ''}`}
          data-edge-id={id}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffset}px)`,
            pointerEvents: 'all',
          }}
          onClick={(e) => {
            e.stopPropagation();
            data.onOpen(id);
          }}
          aria-label={`${relation.label || t(`relation.${relation.kind}`)} · ${status}`}
        >
          {relation.kind === 'integration' ? <GitMerge size={13} /> : <Link2 size={13} />}
          <span>{relation.label || t(`relation.${relation.kind}`)}</span>
          <span className={`edge-status ${result?.state || ''}`}>
            {result?.state === 'integrated' ? (
              <Check size={12} />
            ) : relation.kind === 'integration' && result?.state !== 'pending' ? (
              <CircleHelp size={12} />
            ) : null}
            {status}
          </span>
        </button>
      </EdgeLabelRenderer>
    </>
  );
});

const AnnotationNode = memo(function AnnotationNode({ data, selected }: NodeProps<NoteNode>) {
  const { t } = useTranslation();
  return (
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
  );
});

const nodeTypes = { repository: RepositoryNode, group: RepositoryGroup, note: AnnotationNode };
const edgeTypes = { relation: WorkflowEdge };

function CanvasContents({
  board,
  repositories,
  snapshot,
  selectedRepo,
  selectedEdge,
  selectedGroup,
  selectedIds,
  onSelectRepo,
  onSelectEdge,
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
  onSelectEdge: (id: string) => void;
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
  onLock: () => void;
  onHistory: (direction: 'undo' | 'redo') => void;
  canUndo: boolean;
  canRedo: boolean;
  onGroupSelection: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow();
  const flowStore = useStoreApi<CanvasNode, RelationEdge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const shellRef = useRef<HTMLDivElement>(null);
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
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [zoomLocked, setZoomLocked] = useState(false);
  const [focus, setFocus] = useState<{ ids: string[]; context: boolean } | null>(null);
  const lastFocus = useRef(focus);
  const [exporting, setExporting] = useState(false);
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
  const allGroups = board.groups || [];
  const focusedIds = focus ? selectedNodeIds(board, focus.ids) : [];
  const focusIds =
    focus && focusedIds.length
      ? focus.context
        ? flowContext(board.edges, focusedIds).nodeIds
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
  const context = flowContext(board.edges, seeds);
  const viewBoard = {
    ...board,
    groups,
    edges: board.edges.filter(
      (e) => !focusIds || (focusIds.has(e.source) && focusIds.has(e.target)),
    ),
  };
  const visible = visibleRelations(viewBoard);
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
          }
        }
      const states = board.nodes
        .filter((n) => group.nodeIds.includes(n.id))
        .map((n) => snapshot?.repositories[n.repoId]);
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
        const repo = repositories.find((r) => r.id === node.repoId)!;
        return {
          id: node.id,
          type: 'repository',
          position: node.position,
          measured: dimensions[node.id],
          zIndex: 2,
          domAttributes: { 'aria-roledescription': t('canvas.nodeRole') },
          ariaLabel: t('repository.details', { name: repo.name }),
          selected: selectedIds.includes(node.id),
          className: seeds.length && context.nodeIds.has(node.id) ? 'context-related' : undefined,
          data: { repo, state: snapshot?.repositories[node.repoId], onOpen: onSelectRepo },
        };
      }),
    ...positionedNotes
      .filter((n) => !focusIds || focusIds.has(n.id))
      .map((note): NoteNode => ({
        id: note.id,
        type: 'note',
        position: note.position,
        measured: dimensions[note.id],
        zIndex: 2,
        selected: selectedIds.includes(note.id),
        connectable: false,
        domAttributes: { 'aria-roledescription': t('note.role') },
        ariaLabel: note.title,
        data: { note, onOpen: onSelectNote },
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
  const edges: RelationEdge[] = visible.map(({ relation, source, target }) => {
    const focused = seeds.length > 0 && context.edgeIds.has(relation.id);
    const color =
      relation.id === selectedEdge || focused
        ? 'var(--accent)'
        : relation.kind === 'integration'
          ? 'var(--edge-integration)'
          : 'var(--edge-neutral)';
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
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      data: {
        relation,
        result: snapshot?.relations[relation.id],
        focused,
        onOpen: onSelectEdge,
        labelOffset: (siblings.indexOf(relation.id) - (siblings.length - 1) / 2) * 30,
      },
    };
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      updateNodeInternals([
        ...board.nodes.map((n) => n.id),
        ...(board.notes || []).map((n) => n.id),
        ...(board.groups || []).map((g) => g.id),
      ]),
    );
    return () => cancelAnimationFrame(frame);
  }, [board.nodes, board.notes, board.groups, board.edges, focus, updateNodeInternals]);
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
          const fallback = node.type === 'note' ? NOTE_SIZE : REPOSITORY_SIZE;
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
              lines: [node.data.note.text || t('note.empty')],
            };
          const state = node.data.state;
          const conflicts = state?.files.filter((f) => f.conflicted).length || 0;
          const status = state?.error
            ? t('repository.unavailable')
            : !state
              ? t('repository.reading')
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
            subtitle:
              !state || state.error
                ? ''
                : state.detached
                  ? t('repository.detached')
                  : state.branch || t('repository.unknownBranch'),
            lines: [status, ...(sync ? [sync] : [])],
            tone: state?.error || conflicts ? 'danger' : state?.changed ? 'warning' : 'success',
          };
        }),
        edges: [],
      };
      const paths = [...shellRef.current.querySelectorAll<SVGPathElement>('.workflow-edge-path')];
      const labels = [...shellRef.current.querySelectorAll<HTMLButtonElement>('.edge-label')];
      for (const edge of edges) {
        const path = paths.find((p) => p.id === edge.id);
        const label = labels.find((l) => l.dataset.edgeId === edge.id);
        if (!path || !label || !edge.data) continue;
        const { relation, result } = edge.data;
        const box = path.getBBox();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(label).transform);
        scene.edges.push({
          id: edge.id,
          path: path.getAttribute('d') || '',
          bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
          position: { x: matrix.e + label.offsetWidth / 2, y: matrix.f + label.offsetHeight / 2 },
          width: label.offsetWidth,
          label: relation.label || t(`relation.${relation.kind}`),
          kind: relation.kind,
          status:
            relation.kind !== 'integration'
              ? t('relation.flow')
              : result?.state === 'integrated'
                ? t('relation.included')
                : result?.state === 'pending'
                  ? t('relation.pending', { count: result.pending ?? 0 })
                  : t('relation.unknown'),
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
      className={`canvas-shell ${tool === 'pan' ? 'is-pan-tool' : ''} ${board.layoutLocked ? 'is-layout-locked' : ''}`}
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
          else if (node) onSelectRepo(node.repoId);
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
      <ReactFlow<CanvasNode, RelationEdge>
        colorMode={preferences.theme}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleChanges}
        onConnect={onConnect}
        onNodeClick={(event, node) => {
          if (event.shiftKey || event.ctrlKey || event.metaKey) return;
          if (node.type === 'group' || node.type === 'note') onSelection([node.id]);
          else onSelectRepo(node.data.repo.id);
        }}
        onEdgeClick={(_e, edge) => onSelectEdge(edge.id)}
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
        nodesConnectable={tool === 'select'}
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
        {nodes.length > 0 && (
          <MiniMap
            style={{ width: 125, height: 82 }}
            pannable
            zoomable={!zoomLocked}
            position="bottom-right"
            nodeColor="var(--minimap-node)"
            maskColor="var(--minimap-mask)"
            ariaLabel={t('canvas.minimap')}
          />
        )}
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
              board.notes?.some((note) => note.id === selectedIds[0])))
            ? onEditSelection
            : undefined
        }
        editLabel={t(
          selectedEdge ? 'relation.edit' : selectedGroup ? 'group.edit' : 'note.details',
        )}
        onRemove={onRemoveSelection}
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
          <i />
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
        </div>
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
