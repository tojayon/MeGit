import { useTranslation } from 'react-i18next';
import { editedRoute } from './lib/edge-route';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  CircleAlert,
  Group,
  GraduationCap,
  Link2,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Palette,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type { Connection } from '@xyflow/react';
import type {
  FlowEdge,
  FlowGroup,
  FlowConnection,
  PortSide,
  Repository,
  RepoState,
  Snapshot,
} from '../shared/types';
import { FlowConnectionDialog } from './components/FlowConnectionDialog';
import { useWorkspace } from './lib/use-workspace';
import { api, timeAgo } from './lib/api';
import { createRefreshQueue } from './lib/refresh-queue';
import { FlowCanvas } from './components/FlowCanvas';
import { AddRepositoryDialog, Dialog, RelationDialog, TextDialog } from './components/Dialogs';
import { RepositoryPanel } from './components/RepositoryPanel';
import { CardRefDialog } from './components/CardRefDialog';
import { relationRefs } from '../shared/card-refs';
import { RelationPanel } from './components/RelationPanel';
import { PreferencesDialog } from './components/PreferencesDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { AssistantPanel } from './components/AssistantPanel';
import { AssistantLauncher } from './components/AssistantLauncher';
import { applyBoardOperations, boardSignature } from '../shared/assistant-board';
import { formatError, formatNotice, type NoticeMessage } from './lib/messages';
import { updatePreferences, usePreferences } from './preferences/store';
import { BrandLogo } from './components/BrandLogo';
import { Tooltip } from './components/Tooltip';
import { GitCommandPreview } from './components/GitCommandPreview';
import { statusArguments } from '../shared/git-commands';
import { WorkspaceNavigation } from './components/WorkspaceNavigation';
import { GroupDialog } from './components/GroupDialog';
import { GroupPanel } from './components/GroupPanel';
import { BoardPanel } from './components/BoardPanel';
import { removeNode, saveGroup, reconnectedFlowConnection } from './lib/whiteboard';
import { NotePanel } from './components/NotePanel';
import { Button } from './components/Button';
import { InspectorDock } from './components/InspectorDock';
import {
  emptyDock,
  openInspector,
  closeInspector,
  reconcileInspectors,
  type InspectorItem,
  isInspectorState,
} from './lib/inspector-dock';
import { PopupMenu } from './components/PopupMenu';
import { RemoveBoardDialog } from './components/RemoveBoardDialog';
import { focusWithoutTooltip } from './lib/overlays';
import { GitLearningDialog } from './components/GitLearningDialog';
import { RepositoryIndex } from './components/RepositoryIndex';
import { RepositoryAvatarDialog } from './components/RepositoryAvatarDialog';
import { WorkflowHeader } from './components/WorkflowHeader';
import { useViewState, useViewIssue, viewStorage } from './lib/use-view-state';
import { isBoolean, isNullableText, isStrings, viewKey } from './lib/view-storage';

type Modal =
  | 'add'
  | 'card-ref'
  | 'relation'
  | 'new-board'
  | 'rename-board'
  | 'remove-board'
  | 'help'
  | 'repositories'
  | 'preferences'
  | 'settings'
  | 'group'
  | 'group-details'
  | 'note-details'
  | 'flow-connection'
  | 'board-details'
  | null;

const restorableModal = (value: unknown): value is Modal =>
  value === null ||
  [
    'help',
    'repositories',
    'preferences',
    'board-details',
    'group-details',
    'note-details',
  ].includes(value as string);

export default function App() {
  const { t } = useTranslation();
  const { issue, preferences } = usePreferences();
  const {
    workspace,
    update,
    updateViewport,
    error: workspaceError,
    saveStatus,
    relationsSaved,
    canRetrySave,
    retrySave,
    restore,
    canUndo,
    canRedo,
  } = useWorkspace();
  const error = formatError(workspaceError);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRepo, setSelectedRepo] = useViewState('app.repository', null, isNullableText);
  const [selectedEdge, setSelectedEdge] = useViewState('app.relation', null, isNullableText);
  const [selectedGroup, setSelectedGroup] = useViewState('app.group', null, isNullableText);
  const [selectedIds, setSelectedIds] = useViewState('app.selection', [], isStrings);
  const [dock, setDock] = useViewState('app.dock', emptyDock, isInspectorState);
  const [modal, setModal] = useState<Modal>(() => {
    const saved = viewStorage.read('app.dialog');
    return restorableModal(saved) ? saved : null;
  });
  useLayoutEffect(() => {
    viewStorage.write('app.dialog', restorableModal(modal) ? modal : null);
  }, [modal]);
  const [learningOpen, setLearningOpen] = useViewState('app.learning', false, isBoolean);
  const [assistantOpen, setAssistantOpen] = useViewState('app.assistant', false, isBoolean);
  const viewIssue = useViewIssue();
  const [avatarRepositoryId, setAvatarRepositoryId] = useState<string | null>(null);
  const [removalTarget, setRemovalTarget] = useState<{ id: string; name: string } | null>(null);
  const [relationDraft, setRelationDraft] = useState<Partial<FlowEdge> | undefined>();
  const [connectionDraft, setConnectionDraft] = useState<Partial<FlowConnection> | undefined>();
  const [groupDraft, setGroupDraft] = useState<FlowGroup | undefined>();
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ text: NoticeMessage; error: boolean } | null>(null);
  const [sidebar, setSidebar] = useViewState('app.sidebar', false, isBoolean);
  const [closedBoardId, setClosedBoardId] = useViewState('app.closed-board', null, isNullableText);
  const closeSidebar = useCallback(() => setSidebar(false), [setSidebar]);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boardIdRef = useRef('');
  const snapshotVersion = useRef(0);
  const savedRef = useRef(false);
  const refreshQueue = useRef<(() => Promise<void>) | null>(null);
  const board = workspace?.boards.find((b) => b.id === workspace.activeBoardId);
  useLayoutEffect(() => {
    if (board) viewStorage.write('app.board', board.id);
  }, [board]);
  const openDetails = useCallback(
    (kind: InspectorItem['kind'], id: string, scope?: string) => {
      const boardId = scope || board?.id;
      if (boardId) setDock((previous) => openInspector(previous, boardId, { kind, id }));
    },
    [board?.id, setDock],
  );
  useEffect(() => {
    if (!board) return;
    const valid = [
      ...board.nodes.map((node) => `repository:${node.id}`),
      ...board.edges.map((edge) => `relation:${edge.id}`),
    ];
    queueMicrotask(() => setDock((previous) => reconcileInspectors(previous, board.id, valid)));
  }, [board, setDock]);
  useEffect(() => {
    if (!board) return;
    queueMicrotask(() => {
      if (selectedRepo && !board.nodes.some((node) => node.repoId === selectedRepo))
        setSelectedRepo(null);
      if (
        selectedEdge &&
        ![...board.edges, ...(board.connections ?? [])].some((edge) => edge.id === selectedEdge)
      )
        setSelectedEdge(null);
      const groupExists = board.groups?.some((group) => group.id === selectedGroup);
      if (selectedGroup && !groupExists) setSelectedGroup(null);
      const validIds = new Set([
        ...board.nodes.map((node) => node.id),
        ...(board.groups?.map((group) => group.id) ?? []),
        ...(board.notes?.map((note) => note.id) ?? []),
      ]);
      if (selectedIds.some((id) => !validIds.has(id)))
        setSelectedIds(selectedIds.filter((id) => validIds.has(id)));
      if (
        (modal === 'group-details' && !groupExists) ||
        (modal === 'note-details' && !board.notes?.some((note) => selectedIds.includes(note.id)))
      )
        setModal(null);
    });
  }, [
    board,
    modal,
    selectedRepo,
    selectedEdge,
    selectedGroup,
    selectedIds,
    setSelectedRepo,
    setSelectedEdge,
    setSelectedGroup,
    setSelectedIds,
  ]);
  useEffect(() => {
    boardIdRef.current = board?.id || '';
    savedRef.current = saveStatus === 'saved';
  }, [board?.id, saveStatus]);

  const notify = useCallback((text: NoticeMessage, isError = false) => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, error: isError });
    if (!isError) noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  const readSnapshot = useCallback(async () => {
    const id = boardIdRef.current;
    const version = snapshotVersion.current;
    if (!id || !savedRef.current) return;
    setRefreshing(true);
    try {
      const data = await api.snapshot(id);
      if (boardIdRef.current === id && snapshotVersion.current === version) setSnapshot(data);
    } catch (err) {
      notify(err as Error, true);
    } finally {
      setRefreshing(false);
    }
  }, [notify]);
  useEffect(() => {
    refreshQueue.current ??= createRefreshQueue(readSnapshot);
  }, [readSnapshot]);
  const refresh = useCallback(async () => {
    await refreshQueue.current?.();
  }, []);

  useEffect(() => {
    if (!board?.id || saveStatus !== 'saved') return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [board?.id, workspace?.revision, saveStatus, refresh]);

  const openRepo = useCallback(
    (id: string, targetBoardId?: string, byNode = false) => {
      const targetBoard = targetBoardId
        ? workspace?.boards.find((b) => b.id === targetBoardId)
        : board;
      const node = byNode
        ? targetBoard?.nodes.find((n) => n.id === id)
        : (targetBoard?.nodes.find((n) => n.repoId === id && !n.ref) ??
          targetBoard?.nodes.find((n) => n.repoId === id));
      if (!node) return;
      setClosedBoardId(null);
      setSelectedRepo(node.repoId);
      setSelectedEdge(null);
      setSelectedGroup(null);
      openDetails('repository', node.id, targetBoardId);
      setSelectedIds(node ? [node.id] : []);
      const group = targetBoard?.groups?.find(
        (g) => g.collapsed && node && g.nodeIds.includes(node.id),
      );
      if (group)
        update((draft) => {
          const current = draft.boards.find((b) => b.id === targetBoard!.id)!;
          current.groups!.find((g) => g.id === group.id)!.collapsed = false;
        });
    },
    [
      board,
      workspace,
      update,
      openDetails,
      setClosedBoardId,
      setSelectedRepo,
      setSelectedEdge,
      setSelectedGroup,
      setSelectedIds,
    ],
  );
  const openEdge = useCallback(
    (id: string) => {
      setSelectedIds([]);
      setSelectedEdge(id);
      setSelectedRepo(null);
      setSelectedGroup(null);
      openDetails('relation', id);
    },
    [openDetails, setSelectedIds, setSelectedEdge, setSelectedRepo, setSelectedGroup],
  );
  const openGroup = useCallback(
    (id: string) => {
      setClosedBoardId(null);
      setSelectedIds([id]);
      setSelectedRepo(null);
      setSelectedEdge(null);
      setSelectedGroup(id);
      setModal('group-details');
    },
    [setClosedBoardId, setSelectedIds, setSelectedRepo, setSelectedEdge, setSelectedGroup],
  );
  const selectBackground = useCallback(() => {
    setSelectedIds([]);
    setSelectedRepo(null);
    setSelectedEdge(null);
    setSelectedGroup(null);
  }, [setSelectedIds, setSelectedRepo, setSelectedEdge, setSelectedGroup]);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectedRepo(null);
    setSelectedEdge(null);
    setSelectedGroup(null);
  }, [setSelectedIds, setSelectedRepo, setSelectedEdge, setSelectedGroup]);
  const openNote = useCallback(
    (id: string) => {
      setSelectedIds([id]);
      setSelectedRepo(null);
      setSelectedEdge(null);
      setSelectedGroup(null);
      setModal('note-details');
    },
    [setSelectedIds, setSelectedRepo, setSelectedEdge, setSelectedGroup],
  );
  const historyAction = useCallback(
    (direction: 'undo' | 'redo') => {
      if (!board || board.layoutLocked) return;
      restore(direction, board.id);
      clearSelection();
    },
    [board, restore, clearSelection],
  );
  useEffect(() => {
    const handleHistory = (event: KeyboardEvent) => {
      if (
        modal ||
        closedBoardId === board?.id ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,select,[contenteditable="true"],dialog'))
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      historyAction(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    };
    window.addEventListener('keydown', handleHistory);
    return () => window.removeEventListener('keydown', handleHistory);
  }, [modal, historyAction, closedBoardId, board?.id]);

  function openRelation(draft?: Partial<FlowEdge>) {
    setRelationDraft(draft);
    setModal('relation');
  }
  function connect(connection: Connection) {
    if (connection.source && connection.target && connection.source !== connection.target) {
      if (
        [connection.source, connection.target].some((id) => board?.notes?.some((n) => n.id === id))
      ) {
        setConnectionDraft({
          source: connection.source,
          target: connection.target,
          sourcePort: connection.sourceHandle?.replace('source-', '') as PortSide,
          targetPort: connection.targetHandle?.replace('target-', '') as PortSide,
        });
        setModal('flow-connection');
        return;
      }
      openRelation({
        source: connection.source,
        target: connection.target,
        sourcePort: connection.sourceHandle?.replace('source-', '') as PortSide | undefined,
        targetPort: connection.targetHandle?.replace('target-', '') as PortSide | undefined,
      });
    }
  }

  function toggleGroup(id: string) {
    update((draft) => {
      const group = draft.boards.find((b) => b.id === board!.id)!.groups?.find((g) => g.id === id);
      if (group) group.collapsed = !group.collapsed;
    });
  }

  function createGroup() {
    setGroupDraft(undefined);
    setGroupMembers([]);
    setModal('group');
  }

  const [newCard, setNewCard] = useState<{
    repo: Repository;
    state: RepoState;
    displayName?: string;
  } | null>(null);

  function addRepository(repo: Repository, ref?: string, displayName?: string) {
    if (!board) return;
    if (board.nodes.some((n) => n.repoId === repo.id && n.ref === ref)) {
      notify({ key: 'board.duplicate' });
      return;
    }
    const nodeId = crypto.randomUUID();
    update((draft) => {
      if (!draft.repositories.some((item) => item.id === repo.id)) draft.repositories.push(repo);
      const current = draft.boards.find((b) => b.id === board.id)!;
      const n = current.nodes.length;
      current.nodes.push({
        id: nodeId,
        repoId: repo.id,
        ref,
        displayName,
        position: { x: 100 + (n % 3) * 480, y: 110 + Math.floor(n / 3) * 300 + (n % 2) * 60 },
      });
      delete current.viewport;
    });
    setSelectedIds([nodeId]);
    setSelectedRepo(repo.id);
    setSelectedEdge(null);
    setSelectedGroup(null);
    openDetails('repository', nodeId);
  }

  if (!workspace || !board)
    return (
      <div className="boot-screen">
        <button
          className="icon-button boot-preferences"
          aria-label={t('preferences.title')}
          onClick={() => setModal('preferences')}
        >
          <Palette size={20} />
        </button>
        {modal === 'preferences' && (
          <PreferencesDialog viewKey="app.preferences" onClose={() => setModal(null)} />
        )}
        <BrandLogo variant="full" className="boot-logo" />
        {error ? (
          <>
            <CircleAlert size={22} />
            <p role="alert">{error}</p>
            <button className="button" onClick={() => location.reload()}>
              {t('app.reconnect')}
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={20} />
            <p>{t('app.opening')}</p>
          </>
        )}
      </div>
    );
  const visibleDock = dock.boardId === board.id ? dock : { ...emptyDock, boardId: board.id };
  const boardRepos = workspace.repositories.filter((r) =>
    board.nodes.some((n) => n.repoId === r.id),
  );

  const contextGroup = board.groups?.find((group) => group.id === selectedGroup);
  const contextNote = board.notes?.find((note) => selectedIds.includes(note.id));
  const contextCard =
    selectedIds.length === 1 ? board.nodes.find((node) => node.id === selectedIds[0]) : undefined;
  const contextEdge = board.edges.find((edge) => edge.id === selectedEdge);
  function removeSelection() {
    const ids = new Set(selectedIds);
    update((draft) => {
      const current = draft.boards.find((item) => item.id === board!.id)!;
      for (const node of [...current.nodes, ...(current.notes || [])])
        if (ids.has(node.id)) removeNode(current, node.id);
      current.groups = current.groups?.filter((group) => !ids.has(group.id));
      if (selectedEdge) current.edges = current.edges.filter((edge) => edge.id !== selectedEdge);
      if (selectedEdge && current.connections)
        current.connections = current.connections.filter((edge) => edge.id !== selectedEdge);
    });
    clearSelection();
    requestAnimationFrame(() =>
      focusWithoutTooltip(document.querySelector<HTMLElement>('[data-details-trigger]')),
    );
  }

  const boardClosed = closedBoardId === board.id;
  const navigationControl = (
    <div className="navigation-edge mobile-only" inert={sidebar || undefined}>
      <button
        className="icon-button navigation-toggle mobile-only"
        aria-label={t('nav.open')}
        aria-expanded={sidebar}
        aria-controls="workspace-navigation"
        onClick={() => setSidebar(true)}
      >
        <Menu size={20} />
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      {navigationControl}
      <WorkspaceNavigation
        viewKey={viewKey(board.id, 'navigation')}
        workspace={workspace}
        board={board}
        repositories={boardRepos}
        snapshot={snapshot}
        selectedRepo={selectedIds.length === 1 ? selectedIds[0] : null}
        selectedGroup={selectedGroup}
        onSelectGroup={openGroup}
        mobileOpen={sidebar}
        onMobileClose={closeSidebar}
        onSelectBoard={(id) => {
          setClosedBoardId(null);
          if (id === board.id) return;
          clearSelection();
          if (id !== board.id) setDock(emptyDock);
          setSnapshot(null);
          update((draft) => {
            draft.activeBoardId = id;
          });
        }}
        onSelectRepo={(id) => openRepo(id, undefined, true)}
        onCanvas={() => {
          setClosedBoardId(null);
          setModal(null);
          clearSelection();
        }}
        onRepositories={() => setModal('repositories')}
        onCreate={() => setModal('new-board')}
        onPreferences={() => setModal('preferences')}
        onSettings={() => setModal('settings')}
        onHelp={() => setModal('help')}
      />
      <AssistantLauncher
        open={assistantOpen}
        onToggle={() => setAssistantOpen((saved) => !saved)}
      />
      <AssistantPanel
        board={boardClosed ? undefined : board}
        boardReady={saveStatus === 'saved'}
        onApplyBoard={(plan) => {
          if (
            boardClosed ||
            saveStatus !== 'saved' ||
            plan.boardId !== board.id ||
            Date.now() > Date.parse(plan.expiresAt)
          )
            return false;
          let applied = false;
          update((draft) => {
            const target = draft.boards.find((item) => item.id === plan.boardId);
            if (!target || target.layoutLocked || boardSignature(target) !== plan.baseline) return;
            try {
              Object.assign(target, applyBoardOperations(target, plan.operations));
              applied = true;
            } catch {
              /* Leave the entire board unchanged if the plan no longer validates. */
            }
          });
          return applied;
        }}
        repositories={workspace.repositories}
        initialRepositoryIds={[...new Set(board.nodes.map((node) => node.repoId))]}
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onSettings={() => setModal('settings')}
        onRefresh={refresh}
        settingsOpen={modal === 'settings'}
        onRepositories={() => setModal('repositories')}
        actionViewKey={(repo) => viewKey(board.id, repo.id, repo.path)}
      />
      <main
        className="main-workspace"
        aria-label={board.name}
        inert={sidebar || undefined}
        tabIndex={-1}
        data-details-trigger
      >
        {issue && (
          <div className="global-error preference-warning" role="alert">
            <CircleAlert size={16} />
            <span>{t(`preferences.${issue}`)}</span>
            <button className="text-button" onClick={() => setModal('preferences')}>
              {t('preferences.title')}
            </button>
          </div>
        )}
        {viewIssue && (
          <div className="global-error preference-warning" role="status">
            <CircleAlert size={16} />
            <span>{t(`viewState.${viewIssue}`)}</span>
          </div>
        )}
        {error && (
          <div className="global-error" role="alert">
            <CircleAlert size={16} />
            <span>
              {error}
              {canRetrySave && <small className="save-recovery">{t('board.saveRecovery')}</small>}
            </span>
            {canRetrySave ? (
              <Button size="compact" onClick={retrySave}>
                {t('board.retrySave')}
              </Button>
            ) : (
              <button className="text-button" onClick={() => location.reload()}>
                {t('common.reload')}
              </button>
            )}
          </div>
        )}
        <div className="workspace-body">
          <section className="workflow-panel" hidden={boardClosed}>
            <WorkflowHeader
              board={board}
              onClose={() => {
                setClosedBoardId(board.id);
                requestAnimationFrame(() =>
                  focusWithoutTooltip(
                    document.querySelector<HTMLElement>('[data-workflow-reopen]'),
                  ),
                );
              }}
            />
            <div className="workspace-canvas">
              <div className="workspace-action-rail" role="group" aria-label={t('board.actions')}>
                <Tooltip content={t('board.add')}>
                  <button
                    className="icon-button primary"
                    aria-label={t('board.add')}
                    onClick={() => setModal('add')}
                  >
                    <Plus size={17} />
                  </button>
                </Tooltip>
                <Tooltip
                  detailed
                  content={
                    <>
                      <strong>{t('board.refreshTitle')}</strong>
                      <GitCommandPreview
                        commands={[statusArguments]}
                        when="read"
                        scope="workspace"
                      />
                    </>
                  }
                >
                  <button
                    className="icon-button"
                    aria-label={t('board.refresh')}
                    disabled={refreshing || saveStatus === 'saving'}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                  </button>
                </Tooltip>
                <Tooltip content={t('board.connect')}>
                  <button
                    className="icon-button"
                    aria-label={t('board.connect')}
                    onClick={() => openRelation()}
                    disabled={board.nodes.length < 2}
                  >
                    <Link2 size={16} />
                  </button>
                </Tooltip>
                <Tooltip content={t('group.action')}>
                  <button
                    className="icon-button"
                    aria-label={t('group.action')}
                    onClick={createGroup}
                    disabled={!board.nodes.length}
                  >
                    <Group size={17} />
                  </button>
                </Tooltip>
                <Tooltip content={t('inspector.board')}>
                  <button
                    className="icon-button"
                    aria-label={t('inspector.board')}
                    aria-expanded={modal === 'board-details'}
                    aria-haspopup="dialog"
                    onClick={() => {
                      selectBackground();
                      setModal('board-details');
                    }}
                  >
                    <SlidersHorizontal size={17} />
                  </button>
                </Tooltip>
                <PopupMenu
                  key={board.id}
                  label={t('board.options')}
                  icon={<MoreHorizontal size={18} />}
                  className="board-menu-container"
                  triggerClassName="icon-button"
                  menuClassName="small-menu"
                >
                  <button
                    onClick={() => {
                      setModal('rename-board');
                    }}
                  >
                    <Pencil size={14} />
                    {t('common.rename')}
                  </button>
                  {workspace.boards.length > 1 && (
                    <button
                      className="danger"
                      onClick={() => {
                        setRemovalTarget({ id: board.id, name: board.name });
                        setModal('remove-board');
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {t('board.remove')}
                    </button>
                  )}
                </PopupMenu>
                <span className="mobile-only">
                  <Tooltip content={t('preferences.title')}>
                    <button
                      className="icon-button"
                      aria-label={t('preferences.title')}
                      onClick={() => setModal('preferences')}
                    >
                      <Palette size={19} />
                    </button>
                  </Tooltip>
                </span>
              </div>
              <FlowCanvas
                key={board.id}
                board={board}
                repositories={workspace.repositories}
                snapshot={snapshot}
                selectedRepo={selectedRepo}
                selectedEdge={selectedEdge}
                selectedGroup={selectedGroup}
                selectedIds={selectedIds}
                relationsSaved={relationsSaved}
                onRefresh={refresh}
                onNotice={notify}
                onRepositoryState={(id, state) => {
                  if (boardIdRef.current !== board.id) return;
                  snapshotVersion.current++;
                  setSnapshot((previous) =>
                    previous
                      ? {
                          ...previous,
                          repositories: { ...previous.repositories, [id]: state },
                          relations: {},
                        }
                      : previous,
                  );
                }}
                onSelectRepo={(id) => openRepo(id, undefined, true)}
                onSelectEdge={openEdge}
                onSelectConnection={(id) => {
                  setSelectedIds([]);
                  setSelectedRepo(null);
                  setSelectedGroup(null);
                  setSelectedEdge(id);
                }}
                onEditConnection={(id) => {
                  setSelectedIds([]);
                  setSelectedRepo(null);
                  setSelectedGroup(null);
                  setSelectedEdge(id);
                  setConnectionDraft(board.connections?.find((c) => c.id === id));
                  setModal('flow-connection');
                }}
                onEditSelection={() => {
                  if (contextEdge) openRelation(contextEdge);
                  else if (contextGroup) openGroup(contextGroup.id);
                  else if (contextNote) openNote(contextNote.id);
                  else if (contextCard) setModal('card-ref');
                  else if (selectedEdge && board.connections?.some((c) => c.id === selectedEdge)) {
                    setConnectionDraft(board.connections.find((c) => c.id === selectedEdge));
                    setModal('flow-connection');
                  }
                }}
                onRemoveSelection={removeSelection}
                onSelectGroup={openGroup}
                onToggleGroup={toggleGroup}
                onSelection={(ids) => {
                  setSelectedIds(ids);
                  const id = ids.length === 1 ? ids[0] : null;
                  setSelectedRepo(board.nodes.find((n) => n.id === id)?.repoId || null);
                  setSelectedGroup(board.groups?.some((g) => g.id === id) ? id : null);
                  setSelectedEdge(null);
                }}
                onSelectNote={openNote}
                onAddNote={(position) => {
                  const id = crypto.randomUUID();
                  update((draft) => {
                    const current = draft.boards.find((b) => b.id === board.id)!;
                    current.notes ||= [];
                    current.notes.push({
                      id,
                      title: t('note.defaultTitle'),
                      text: '',
                      position: {
                        x: Math.max(-100000, Math.min(100000, position.x)),
                        y: Math.max(-100000, Math.min(100000, position.y)),
                      },
                    });
                  });
                  openNote(id);
                }}
                onAddStep={(position) => {
                  const id = crypto.randomUUID();
                  update((draft) => {
                    const current = draft.boards.find((b) => b.id === board.id)!;
                    current.notes ||= [];
                    current.notes.push({
                      id,
                      kind: 'process',
                      title: t('flowchart.process'),
                      summary: '',
                      text: '',
                      position: {
                        x: Math.max(-100000, Math.min(100000, position.x)),
                        y: Math.max(-100000, Math.min(100000, position.y)),
                      },
                    });
                  });
                  openNote(id);
                }}
                onLock={() =>
                  update((draft) => {
                    const current = draft.boards.find((b) => b.id === board.id)!;
                    current.layoutLocked = !current.layoutLocked;
                  })
                }
                canUndo={canUndo}
                canRedo={canRedo}
                onHistory={historyAction}
                onGroupSelection={(ids) => {
                  setGroupDraft(undefined);
                  setGroupMembers(ids.filter((id) => board.nodes.some((n) => n.id === id)));
                  setModal('group');
                }}
                onConnect={connect}
                onRoute={(id, points, ports) =>
                  update((draft) => {
                    const current = draft.boards.find((b) => b.id === board.id)!;
                    const next = editedRoute(current, id, points);
                    if (!next) return;
                    if ('kind' in next && points?.length && ports) Object.assign(next, ports);
                    if ('kind' in next)
                      current.edges = current.edges.map((e) => (e.id === id ? next : e));
                    else
                      current.connections = current.connections?.map((e) =>
                        e.id === id ? next : e,
                      );
                  })
                }
                onReconnect={(id, connection) =>
                  update((draft) => {
                    const current = draft.boards.find((b) => b.id === board.id)!;
                    const next = reconnectedFlowConnection(current, id, connection);
                    if (next)
                      current.connections = current.connections!.map((c) =>
                        c.id === id ? next : c,
                      );
                  })
                }
                onMove={(positions) =>
                  update((draft) => {
                    const current = draft.boards.find((b) => b.id === board.id)!;
                    if (current.layoutLocked) return;
                    for (const node of [...current.nodes, ...(current.notes || [])])
                      if (positions[node.id]) node.position = positions[node.id];
                  })
                }
                onViewport={(viewport) => updateViewport(board.id, viewport)}
                onAdd={() => setModal('add')}
                onClear={selectBackground}
              />
            </div>
          </section>
          {boardClosed && (
            <div className="workflow-panel-closed">
              <div className="workflow-panel-reopen">
                <p>{t('board.panelClosed')}</p>
                <Button
                  data-workflow-reopen
                  onClick={() => {
                    setClosedBoardId(null);
                    requestAnimationFrame(() =>
                      focusWithoutTooltip(
                        document.querySelector<HTMLElement>('.workflow-panel [data-panel-close]'),
                      ),
                    );
                  }}
                >
                  {t('board.reopen')}
                </Button>
              </div>
            </div>
          )}
          {!!visibleDock.items.length && (
            <InspectorDock
              viewKey={viewKey(board.id, 'dock')}
              state={visibleDock}
              width={preferences.inspectorWidth}
              onWidth={(inspectorWidth) => updatePreferences({ inspectorWidth })}
              onActive={(active) =>
                setDock((previous) =>
                  previous.active === active ? previous : { ...previous, active },
                )
              }
              onClose={(key) => setDock((previous) => closeInspector(previous, key))}
            >
              {(item, close) => {
                const repositoryForCard = (cardId: string) => {
                  const card = board.nodes.find((node) => node.id === cardId);
                  const repo = workspace.repositories.find((entry) => entry.id === card?.repoId);
                  return repo && card?.displayName ? { ...repo, name: card.displayName } : repo;
                };
                const activeCard =
                  item.kind === 'repository'
                    ? board.nodes.find((node) => node.id === item.id)
                    : undefined;
                const activeRepo = activeCard && repositoryForCard(activeCard.id);
                const activeEdge =
                  item.kind === 'relation' ? board.edges.find((e) => e.id === item.id) : undefined;
                return (
                  <>
                    {activeRepo && activeCard && (
                      <RepositoryPanel
                        viewKey={viewKey(
                          board.id,
                          activeCard.id,
                          activeCard.ref || 'HEAD',
                          activeRepo.path,
                        )}
                        key={`${activeCard.id}:${activeCard.ref || 'HEAD'}`}
                        cardRef={activeCard.ref}
                        actionViewKey={viewKey(board.id, activeRepo.id, activeRepo.path)}
                        repo={activeRepo}
                        state={snapshot?.repositories[activeRepo.id]}
                        onClose={close}
                        onRefresh={refresh}
                        onState={(state) => {
                          if (boardIdRef.current !== board.id) return;
                          snapshotVersion.current++;
                          setSnapshot((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  repositories: {
                                    ...previous.repositories,
                                    [activeRepo.id]: state,
                                  },
                                  relations: {},
                                }
                              : previous,
                          );
                        }}
                        onNotice={notify}
                        onAvatar={() => setAvatarRepositoryId(activeRepo.id)}
                        avatarDisabled={saveStatus === 'failed'}
                      />
                    )}
                    {activeEdge && (
                      <RelationPanel
                        boardId={board.id}
                        viewKey={viewKey(board.id, activeEdge.id, 'relation')}
                        edge={{ ...activeEdge, ...relationRefs(activeEdge, board.nodes) }}
                        source={repositoryForCard(activeEdge.source)}
                        target={repositoryForCard(activeEdge.target)}
                        result={snapshot?.relations[activeEdge.id]}
                        onClose={close}
                      />
                    )}
                  </>
                );
              }}
            </InspectorDock>
          )}
        </div>
        <footer className="workspace-statusbar">
          <span className="workspace-status-summary">
            <span className={'save-state ' + saveStatus} role="status">
              {saveStatus === 'saving' ? (
                <LoaderCircle className="spin" size={13} />
              ) : saveStatus === 'failed' ? (
                <CircleAlert size={13} />
              ) : (
                <Check size={13} />
              )}
              {t(
                saveStatus === 'failed'
                  ? 'board.failed'
                  : saveStatus === 'saving'
                    ? 'board.saving'
                    : 'board.saved',
              )}
            </span>
            <span className="statusbar-dot">·</span>
            {t('board.repositories', { count: board.nodes.length })}
            <span className="statusbar-dot">·</span>
            {t('board.relations', { count: board.edges.length })}
            {!!board.connections?.length && (
              <> · {t('flowchart.connections', { count: board.connections.length })}</>
            )}
          </span>
          <span data-mobile-label={t('nav.service')}>
            {refreshing
              ? t('board.reading')
              : snapshot
                ? t('board.checked', { time: timeAgo(snapshot.checkedAt) })
                : t('board.waiting')}
            <span className="statusbar-dot">·</span>
            {t('board.autoCheck')}
          </span>
        </footer>
      </main>
      {modal === 'preferences' && (
        <PreferencesDialog viewKey="app.preferences" onClose={() => setModal(null)} />
      )}
      {modal === 'settings' && (
        <SettingsDialog
          key={board.id}
          onClose={() => setModal(null)}
          ai={{
            repositories: boardClosed ? [] : boardRepos,
            selectedRepo,
            canApply: !boardClosed && !board.layoutLocked && saveStatus !== 'failed',
            applyDiagram: (diagram) => {
              if (
                boardClosed ||
                board.layoutLocked ||
                saveStatus === 'failed' ||
                (board.notes?.length ?? 0) + diagram.nodes.length > 200 ||
                (board.connections?.length ?? 0) + diagram.edges.length > 600
              )
                return false;
              const occupied = [...board.nodes, ...(board.notes ?? [])];
              const bottom = Math.max(-220, ...occupied.map((node) => node.position.y));
              const start = bottom + 300;
              if (start + diagram.nodes.length * 160 > 100000) return false;
              update((draft) => {
                const target = draft.boards.find((item) => item.id === board.id);
                if (!target || target.layoutLocked) return;
                const notes = diagram.nodes.map((node, index) => ({
                  ...node,
                  id: crypto.randomUUID(),
                  text: '',
                  position: { x: 80, y: start + index * 160 },
                }));
                (target.notes ??= []).push(...notes);
                (target.connections ??= []).push(
                  ...diagram.edges.map((edge) => ({
                    id: crypto.randomUUID(),
                    source: notes[edge.source].id,
                    target: notes[edge.target].id,
                    label: edge.label,
                  })),
                );
              });
              return true;
            },
          }}
        />
      )}
      {modal === 'board-details' && (
        <BoardPanel
          key={board.id}
          viewKey={viewKey(board.id, 'details')}
          board={board}
          onClose={() => setModal(null)}
          onGroup={openGroup}
          onSave={(details) =>
            update((draft) => {
              Object.assign(
                draft.boards.find((item) => item.id === board.id)!,
                details,
              );
            })
          }
        />
      )}
      {modal === 'group-details' && contextGroup && (
        <GroupPanel
          viewKey={viewKey(board.id, contextGroup.id, 'details')}
          group={contextGroup}
          board={board}
          repositories={workspace.repositories}
          snapshot={snapshot}
          onClose={() => setModal(null)}
          onRepo={(id) => {
            setModal(null);
            openRepo(id, undefined, true);
          }}
          onToggle={() => toggleGroup(contextGroup.id)}
          onEdit={() => {
            setGroupDraft(contextGroup);
            setModal('group');
          }}
        />
      )}
      {modal === 'note-details' && contextNote && (
        <NotePanel
          key={contextNote.id}
          viewKey={viewKey(board.id, contextNote.id, 'details')}
          note={contextNote}
          onClose={() => setModal(null)}
          onSave={(fields) =>
            update((draft) => {
              Object.assign(
                draft.boards
                  .find((item) => item.id === board.id)!
                  .notes!.find((note) => note.id === contextNote.id)!,
                fields,
              );
            })
          }
        />
      )}
      {modal === 'flow-connection' && (
        <FlowConnectionDialog
          board={board}
          repositories={workspace.repositories}
          initial={connectionDraft}
          onClose={() => setModal(null)}
          onSave={(connection) =>
            update((draft) => {
              const current = draft.boards.find((b) => b.id === board.id)!;
              current.connections ||= [];
              const index = current.connections.findIndex((c) => c.id === connection.id);
              if (index < 0) current.connections.push(connection);
              else current.connections[index] = connection;
            })
          }
        />
      )}
      {modal === 'group' && (
        <GroupDialog
          board={board}
          repositories={workspace.repositories}
          initial={groupDraft}
          initialMemberIds={groupMembers}
          onClose={() => setModal(null)}
          onSave={(group) => {
            update((draft) =>
              saveGroup(
                draft.boards.find((b) => b.id === board.id)!,
                group,
              ),
            );
            setSelectedIds([group.id]);
            setSelectedGroup(group.id);
            setSelectedRepo(null);
            setSelectedEdge(null);
          }}
        />
      )}
      {modal === 'add' && (
        <AddRepositoryDialog
          existing={workspace.repositories}
          onAdd={addRepository}
          onChooseCard={(repo, state, displayName) => {
            if (board.nodes.some((node) => node.repoId === repo.id))
              setNewCard({ repo, state, displayName });
            else addRepository(repo, undefined, displayName);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {newCard && (
        <CardRefDialog
          state={newCard.state}
          initialName={newCard.displayName}
          used={
            new Set(
              board.nodes
                .filter((node) => node.repoId === newCard.repo.id)
                .map((node) => node.ref ?? ''),
            )
          }
          onSave={(ref, displayName) => {
            addRepository(newCard.repo, ref, displayName);
            setNewCard(null);
          }}
          onClose={() => setNewCard(null)}
        />
      )}
      {modal === 'card-ref' && contextCard && (
        <CardRefDialog
          state={snapshot?.repositories[contextCard.repoId]}
          initial={contextCard.ref}
          initialName={contextCard.displayName}
          used={
            new Set(
              board.nodes
                .filter((node) => node.id !== contextCard.id && node.repoId === contextCard.repoId)
                .map((node) => node.ref ?? ''),
            )
          }
          onSave={(ref, displayName) => {
            update((draft) => {
              const card = draft.boards
                .find((item) => item.id === board.id)!
                .nodes.find((node) => node.id === contextCard.id)!;
              card.ref = ref;
              card.displayName = displayName;
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'relation' && (
        <RelationDialog
          board={board}
          repositories={workspace.repositories}
          initial={relationDraft}
          onSave={(edge) => {
            update((draft) => {
              const current = draft.boards.find((b) => b.id === board.id)!;
              const index = current.edges.findIndex((e) => e.id === edge.id);
              if (index < 0) current.edges.push(edge);
              else current.edges[index] = edge;
            });
            openEdge(edge.id);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'new-board' && (
        <TextDialog
          title={t('nav.newBoard')}
          label={t('board.name')}
          onSubmit={(name) => {
            const id = crypto.randomUUID();
            update((draft) => {
              draft.boards.push({ id, name, description: '', nodes: [], edges: [] });
              draft.activeBoardId = id;
            });
            clearSelection();
            setDock(emptyDock);
            setClosedBoardId(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'remove-board' && removalTarget && (
        <RemoveBoardDialog
          name={removalTarget.name}
          onClose={() => {
            setModal(null);
            setRemovalTarget(null);
          }}
          onConfirm={() => {
            update((draft) => {
              if (draft.boards.length <= 1) return;
              draft.boards = draft.boards.filter((b) => b.id !== removalTarget.id);
              if (draft.activeBoardId === removalTarget.id)
                draft.activeBoardId = draft.boards[0].id;
            });
            if (board.id === removalTarget.id) {
              clearSelection();
              setDock(emptyDock);
            }
            setModal(null);
            setRemovalTarget(null);
          }}
        />
      )}
      {modal === 'rename-board' && (
        <TextDialog
          title={t('board.rename')}
          label={t('board.name')}
          initial={board.name}
          onSubmit={(name) =>
            update((draft) => {
              draft.boards.find((b) => b.id === board.id)!.name = name;
            })
          }
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'help' && (
        <Dialog
          viewKey="app.help"
          title={t('help.title')}
          onClose={() => setModal(null)}
          headerActions={
            <Button
              size="compact"
              icon={<GraduationCap size={17} />}
              onClick={() => setLearningOpen(true)}
            >
              {t('learning.open')}
            </Button>
          }
        >
          <div className="dialog-body help-content">
            <div className="brand-wordmark">
              <BrandLogo variant="full" className="help-logo" />
              <span>{t('help.tagline')}</span>
            </div>
            <p>{t('help.intro')}</p>
            <h3>{t('help.board')}</h3>
            <p>{t('help.boardHelp')}</p>
            <h3>{t('help.tools')}</h3>
            <p>{t('help.toolsHelp')}</p>
            <h3>{t('help.state')}</h3>
            <p>{t('help.stateHelp')}</p>
            <h3>{t('help.local')}</h3>
            <p>{t('help.localHelp')}</p>
          </div>
        </Dialog>
      )}
      {learningOpen && (
        <GitLearningDialog viewKey="learning" onClose={() => setLearningOpen(false)} />
      )}
      {modal === 'repositories' && (
        <RepositoryIndex
          repositories={workspace.repositories}
          used={new Set(workspace.boards.flatMap((item) => item.nodes.map((node) => node.repoId)))}
          readOnly={saveStatus === 'failed'}
          canAddToBoard={!board.layoutLocked && board.nodes.length < 200}
          onClose={() => setModal(null)}
          onRegister={(repo) =>
            update((draft) => {
              if (
                !draft.repositories.some(
                  (item) => item.path.toLowerCase() === repo.path.toLowerCase(),
                )
              )
                draft.repositories.push(repo);
            })
          }
          onEdit={(changes) =>
            update((draft) => {
              const repo = draft.repositories.find((item) => item.id === changes.id);
              if (!repo) return;
              repo.name = changes.name;
              if (changes.archived) repo.archived = true;
              else delete repo.archived;
              if (changes.logoPath) repo.logoPath = changes.logoPath;
              else delete repo.logoPath;
            })
          }
          onRemove={(id) =>
            update((draft) => {
              for (const item of draft.boards) {
                for (const node of item.nodes.filter((node) => node.repoId === id))
                  removeNode(item, node.id);
              }
              draft.repositories = draft.repositories.filter((item) => item.id !== id);
            })
          }
          onOpen={(repo) => {
            const found = [board, ...workspace.boards].find((item) =>
              item.nodes.some((node) => node.repoId === repo.id),
            );
            if (found) {
              update((draft) => {
                draft.activeBoardId = found.id;
              });
              openRepo(repo.id, found.id);
            } else {
              if (board.layoutLocked) return;
              setClosedBoardId(null);
              addRepository(repo);
            }
            setModal(null);
          }}
        />
      )}
      {avatarRepositoryId &&
        workspace.repositories.find((repo) => repo.id === avatarRepositoryId) && (
          <RepositoryAvatarDialog
            key={avatarRepositoryId}
            repo={workspace.repositories.find((repo) => repo.id === avatarRepositoryId)!}
            disabled={saveStatus === 'failed'}
            onClose={() => setAvatarRepositoryId(null)}
            onSave={(logoPath) =>
              update((draft) => {
                const repo = draft.repositories.find((item) => item.id === avatarRepositoryId);
                if (repo) {
                  if (logoPath) repo.logoPath = logoPath;
                  else delete repo.logoPath;
                }
              })
            }
          />
        )}
      {notice && (
        <div
          className={`toast ${notice.error ? 'toast-error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.error ? <CircleAlert size={17} /> : <Check size={17} />}
          <span>{formatNotice(notice.text)}</span>
          <button
            className="icon-button small"
            aria-label={t('common.dismiss')}
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
