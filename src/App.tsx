import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Group,
  GraduationCap,
  Link2,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type { Connection } from '@xyflow/react';
import type { FlowEdge, FlowGroup, PortSide, Repository, Snapshot } from '../shared/types';
import { useWorkspace } from './lib/use-workspace';
import { api, timeAgo } from './lib/api';
import { createRefreshQueue } from './lib/refresh-queue';
import { FlowCanvas } from './components/FlowCanvas';
import { AddRepositoryDialog, Dialog, RelationDialog, TextDialog } from './components/Dialogs';
import { RepositoryPanel } from './components/RepositoryPanel';
import { RelationPanel } from './components/RelationPanel';
import { PreferencesDialog } from './components/PreferencesDialog';
import { formatError, formatNotice, type NoticeMessage } from './lib/messages';
import { updatePreferences, usePreferences } from './preferences/store';
import { BrandLogo } from './components/BrandLogo';
import { Tooltip } from './components/Tooltip';
import { WorkspaceNavigation } from './components/WorkspaceNavigation';
import { GroupDialog } from './components/GroupDialog';
import { GroupPanel } from './components/GroupPanel';
import { BoardPanel } from './components/BoardPanel';
import { removeNode, saveGroup } from './lib/whiteboard';
import { NotePanel } from './components/NotePanel';
import { Button } from './components/Button';
import { InspectorDock } from './components/InspectorDock';
import {
  emptyDock,
  openInspector,
  closeInspector,
  reconcileInspectors,
  type InspectorItem,
} from './lib/inspector-dock';
import { PopupMenu } from './components/PopupMenu';
import { RemoveBoardDialog } from './components/RemoveBoardDialog';
import { focusWithoutTooltip } from './lib/overlays';
import { GitLearningDialog } from './components/GitLearningDialog';
import { RepositoryAvatar } from './components/RepositoryAvatar';
import { RepositoryAvatarDialog } from './components/RepositoryAvatarDialog';

type Modal =
  | 'add'
  | 'relation'
  | 'new-board'
  | 'rename-board'
  | 'remove-board'
  | 'help'
  | 'repositories'
  | 'preferences'
  | 'group'
  | 'group-details'
  | 'note-details'
  | 'board-details'
  | null;

export default function App() {
  const { t } = useTranslation();
  const { issue, preferences } = usePreferences();
  const {
    workspace,
    update,
    error: workspaceError,
    saveStatus,
    canRetrySave,
    retrySave,
    restore,
    canUndo,
    canRedo,
  } = useWorkspace();
  const error = formatError(workspaceError);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(emptyDock);
  const [modal, setModal] = useState<Modal>(null);
  const [learningOpen, setLearningOpen] = useState(false);
  const [avatarRepositoryId, setAvatarRepositoryId] = useState<string | null>(null);
  const [removalTarget, setRemovalTarget] = useState<{ id: string; name: string } | null>(null);
  const [relationDraft, setRelationDraft] = useState<Partial<FlowEdge> | undefined>();
  const [groupDraft, setGroupDraft] = useState<FlowGroup | undefined>();
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ text: NoticeMessage; error: boolean } | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const closeSidebar = useCallback(() => setSidebar(false), []);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const boardIdRef = useRef('');
  const snapshotVersion = useRef(0);
  const savedRef = useRef(false);
  const refreshQueue = useRef<(() => Promise<void>) | null>(null);
  const board = workspace?.boards.find((b) => b.id === workspace.activeBoardId);
  const openDetails = useCallback(
    (kind: InspectorItem['kind'], id: string, scope?: string) => {
      const boardId = scope || board?.id;
      if (boardId) setDock((previous) => openInspector(previous, boardId, { kind, id }));
    },
    [board?.id],
  );
  useEffect(() => {
    if (!board) return;
    const valid = [
      ...board.nodes.map((node) => `repository:${node.repoId}`),
      ...board.edges.map((edge) => `relation:${edge.id}`),
    ];
    queueMicrotask(() => setDock((previous) => reconcileInspectors(previous, board.id, valid)));
  }, [board]);
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
    (id: string, targetBoardId?: string) => {
      setSelectedRepo(id);
      setSelectedEdge(null);
      setSelectedGroup(null);
      openDetails('repository', id, targetBoardId);
      const targetBoard = targetBoardId
        ? workspace?.boards.find((b) => b.id === targetBoardId)
        : board;
      const node = targetBoard?.nodes.find((n) => n.repoId === id);
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
    [board, workspace, update, openDetails],
  );
  const openEdge = useCallback(
    (id: string) => {
      setSelectedIds([]);
      setSelectedEdge(id);
      setSelectedRepo(null);
      setSelectedGroup(null);
      openDetails('relation', id);
    },
    [openDetails],
  );
  const openGroup = useCallback((id: string) => {
    setSelectedIds([id]);
    setSelectedRepo(null);
    setSelectedEdge(null);
    setSelectedGroup(id);
    setModal('group-details');
  }, []);
  const selectBackground = useCallback(() => {
    setSelectedIds([]);
    setSelectedRepo(null);
    setSelectedEdge(null);
    setSelectedGroup(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectedRepo(null);
    setSelectedEdge(null);
    setSelectedGroup(null);
  }, []);
  const openNote = useCallback((id: string) => {
    setSelectedIds([id]);
    setSelectedRepo(null);
    setSelectedEdge(null);
    setSelectedGroup(null);
    setModal('note-details');
  }, []);
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
  }, [modal, historyAction]);

  function openRelation(draft?: Partial<FlowEdge>) {
    setRelationDraft(draft);
    setModal('relation');
  }
  function connect(connection: Connection) {
    if (connection.source && connection.target && connection.source !== connection.target)
      openRelation({
        source: connection.source,
        target: connection.target,
        sourcePort: connection.sourceHandle?.replace('source-', '') as PortSide | undefined,
        targetPort: connection.targetHandle?.replace('target-', '') as PortSide | undefined,
      });
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

  function addRepository(repo: Repository) {
    if (!board) return;
    if (board.nodes.some((n) => n.repoId === repo.id)) {
      notify({ key: 'board.duplicate' });
      return;
    }
    const nodeId = crypto.randomUUID();
    update((draft) => {
      if (!draft.repositories.some((r) => r.id === repo.id)) draft.repositories.push(repo);
      const current = draft.boards.find((b) => b.id === board.id)!;
      const n = current.nodes.length;
      current.nodes.push({
        id: nodeId,
        repoId: repo.id,
        position: { x: 100 + (n % 3) * 480, y: 110 + Math.floor(n / 3) * 300 + (n % 2) * 60 },
      });
      delete current.viewport;
    });
    setSelectedIds([nodeId]);
    setSelectedRepo(repo.id);
    setSelectedEdge(null);
    setSelectedGroup(null);
    openDetails('repository', repo.id);
  }

  if (!workspace || !board)
    return (
      <div className="boot-screen">
        <button
          className="icon-button boot-preferences"
          aria-label={t('preferences.title')}
          onClick={() => setModal('preferences')}
        >
          <Settings2 size={20} />
        </button>
        {modal === 'preferences' && <PreferencesDialog onClose={() => setModal(null)} />}
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
  const contextEdge = board.edges.find((edge) => edge.id === selectedEdge);
  function removeSelection() {
    const ids = new Set(selectedIds);
    update((draft) => {
      const current = draft.boards.find((item) => item.id === board!.id)!;
      for (const node of [...current.nodes]) if (ids.has(node.id)) removeNode(current, node.id);
      current.notes = current.notes?.filter((note) => !ids.has(note.id));
      current.groups = current.groups?.filter((group) => !ids.has(group.id));
      if (selectedEdge) current.edges = current.edges.filter((edge) => edge.id !== selectedEdge);
    });
    clearSelection();
    requestAnimationFrame(() =>
      focusWithoutTooltip(document.querySelector<HTMLElement>('[data-details-trigger]')),
    );
  }

  return (
    <div className="app-shell">
      <WorkspaceNavigation
        workspace={workspace}
        board={board}
        repositories={boardRepos}
        snapshot={snapshot}
        selectedRepo={selectedRepo}
        selectedGroup={selectedGroup}
        onSelectGroup={openGroup}
        mobileOpen={sidebar}
        onMobileClose={closeSidebar}
        onSelectBoard={(id) => {
          clearSelection();
          if (id !== board.id) setDock(emptyDock);
          setSnapshot(null);
          update((draft) => {
            draft.activeBoardId = id;
          });
        }}
        onSelectRepo={openRepo}
        onCanvas={() => {
          setModal(null);
          clearSelection();
        }}
        onRepositories={() => setModal('repositories')}
        onCreate={() => setModal('new-board')}
        onPreferences={() => setModal('preferences')}
        onHelp={() => setModal('help')}
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
          <div className="workspace-canvas">
            <div className="canvas-navigation-control">
              <span className="desktop-only">
                <Tooltip
                  content={t(preferences.navigationCollapsed ? 'nav.expand' : 'nav.collapse')}
                  placement="right"
                >
                  <button
                    className="icon-button navigation-toggle"
                    aria-label={t(preferences.navigationCollapsed ? 'nav.expand' : 'nav.collapse')}
                    aria-expanded={!preferences.navigationCollapsed}
                    aria-controls="workspace-navigation"
                    onClick={() =>
                      updatePreferences({ navigationCollapsed: !preferences.navigationCollapsed })
                    }
                  >
                    {preferences.navigationCollapsed ? (
                      <PanelLeftOpen size={18} />
                    ) : (
                      <PanelLeftClose size={18} />
                    )}
                  </button>
                </Tooltip>
              </span>
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
              <Tooltip content={t('board.refreshTitle')}>
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
                    <Settings2 size={19} />
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
              onSelectRepo={openRepo}
              onSelectEdge={openEdge}
              onEditSelection={() => {
                if (contextEdge) openRelation(contextEdge);
                else if (contextGroup) openGroup(contextGroup.id);
                else if (contextNote) openNote(contextNote.id);
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
              onMove={(positions) =>
                update((draft) => {
                  const current = draft.boards.find((b) => b.id === board.id)!;
                  if (current.layoutLocked) return;
                  for (const node of [...current.nodes, ...(current.notes || [])])
                    if (positions[node.id]) node.position = positions[node.id];
                })
              }
              onViewport={(viewport) =>
                update((draft) => {
                  draft.boards.find((b) => b.id === board.id)!.viewport = viewport;
                })
              }
              onAdd={() => setModal('add')}
              onClear={selectBackground}
            />
          </div>
          {!!visibleDock.items.length && (
            <InspectorDock
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
                const activeRepo =
                  item.kind === 'repository' && board.nodes.some((n) => n.repoId === item.id)
                    ? workspace.repositories.find((r) => r.id === item.id)
                    : undefined;
                const activeEdge =
                  item.kind === 'relation' ? board.edges.find((e) => e.id === item.id) : undefined;
                return (
                  <>
                    {activeRepo && (
                      <RepositoryPanel
                        key={activeRepo.id}
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
                        edge={activeEdge}
                        source={workspace.repositories.find(
                          (r) =>
                            r.id === board.nodes.find((n) => n.id === activeEdge.source)?.repoId,
                        )}
                        target={workspace.repositories.find(
                          (r) =>
                            r.id === board.nodes.find((n) => n.id === activeEdge.target)?.repoId,
                        )}
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
      {modal === 'preferences' && <PreferencesDialog onClose={() => setModal(null)} />}
      {modal === 'board-details' && (
        <BoardPanel
          key={board.id}
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
          group={contextGroup}
          board={board}
          repositories={workspace.repositories}
          snapshot={snapshot}
          onClose={() => setModal(null)}
          onRepo={(id) => {
            setModal(null);
            openRepo(id);
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
      {learningOpen && <GitLearningDialog onClose={() => setLearningOpen(false)} />}
      {modal === 'repositories' && (
        <Dialog title={t('nav.repositories')} onClose={() => setModal(null)}>
          <div className="dialog-body">
            <p className="muted">{t('board.indexHelp')}</p>
            {workspace.repositories.length ? (
              workspace.repositories.map((repo) => (
                <button
                  className="indexed-repo"
                  key={repo.id}
                  onClick={() => {
                    const found = workspace.boards.find((b) =>
                      b.nodes.some((n) => n.repoId === repo.id),
                    );
                    if (found) {
                      update((draft) => {
                        draft.activeBoardId = found.id;
                      });
                      openRepo(repo.id, found.id);
                    } else addRepository(repo);
                    setModal(null);
                  }}
                >
                  <RepositoryAvatar repo={repo} />
                  <span>
                    <strong>{repo.name}</strong>
                    <small>{repo.path}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <div className="panel-empty">
                <Search size={25} />
                <p>{t('board.indexEmpty')}</p>
              </div>
            )}
          </div>
        </Dialog>
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
