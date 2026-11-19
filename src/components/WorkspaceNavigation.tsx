import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import {
  ArrowUpRight,
  CircleHelp,
  FolderGit2,
  Group,
  Network,
  Plus,
  Settings2,
  Workflow,
  X,
} from 'lucide-react';
import type { Board, Repository, Snapshot, Workspace } from '../../shared/types';
import { updatePreferences, usePreferences } from '../preferences/store';
import { BrandLogo } from './BrandLogo';
import { Tooltip } from './Tooltip';
import { IconButton } from './IconButton';
import { NavigationFlyout } from './NavigationFlyout';
import { dismissPopups, focusWithoutTooltip } from '../lib/overlays';
import { version } from '../../package.json';
import { useScrollMemory } from '../lib/use-view-state';

const narrowQuery = '(max-width: 760px)';
function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function isNarrow() {
  return window.matchMedia(narrowQuery).matches;
}

export function WorkspaceNavigation({
  workspace,
  viewKey,
  board,
  repositories,
  snapshot,
  selectedRepo,
  selectedGroup,
  mobileOpen,
  onMobileClose,
  onSelectBoard,
  onSelectRepo,
  onSelectGroup,
  onCanvas,
  onRepositories,
  onCreate,
  onPreferences,
  onHelp,
}: {
  workspace: Workspace;
  viewKey?: string;
  board: Board;
  repositories: Repository[];
  snapshot: Snapshot | null;
  selectedRepo: string | null;
  selectedGroup: string | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onSelectBoard: (id: string) => void;
  onSelectRepo: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onCanvas: () => void;
  onRepositories: () => void;
  onCreate: () => void;
  onPreferences: () => void;
  onHelp: () => void;
}) {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow);
  const collapsed = !narrow && preferences.navigationCollapsed;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useScrollMemory(scroll, viewKey, !collapsed && (!narrow || mobileOpen));

  useEffect(() => {
    if (!narrow && mobileOpen) onMobileClose();
  }, [narrow, mobileOpen, onMobileClose]);

  useEffect(() => {
    if (!narrow || !mobileOpen) return;
    const prior = document.activeElement as HTMLElement | null;
    dismissPopups();
    focusWithoutTooltip(closeRef.current);
    return () => {
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        if (prior?.getClientRects().length) focusWithoutTooltip(prior);
        else
          focusWithoutTooltip(
            document.querySelector<HTMLButtonElement>(
              '.canvas-navigation-control .navigation-toggle',
            ),
          );
      });
    };
  }, [narrow, mobileOpen]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!narrow || !mobileOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onMobileClose();
    } else if (event.key === 'Tab') {
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  function action(label: string, icon: ReactNode, onClick: () => void, active = false) {
    return (
      <Tooltip content={label} placement="right">
        <button
          className={`navigation-action ${active ? 'active' : ''}`}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          onClick={onClick}
        >
          {icon}
          {!collapsed && <span>{label}</span>}
        </button>
      </Tooltip>
    );
  }

  function repositoryItem(repo: Repository) {
    return (
      <button
        className={`outline-repo ${selectedRepo === repo.id ? 'selected' : ''}`}
        key={repo.id}
        aria-pressed={selectedRepo === repo.id}
        onClick={() => {
          onSelectRepo(repo.id);
          if (narrow) onMobileClose();
        }}
      >
        <span className="outline-repository-icon">
          <RepositoryAvatar repo={repo} size="small" />
          <span
            className={`status-dot ${snapshot?.repositories[repo.id]?.error ? 'error' : snapshot?.repositories[repo.id]?.changed ? 'modified' : ''}`}
          />
        </span>
        <span>{repo.name}</span>
        <ArrowUpRight size={13} />
      </button>
    );
  }

  function workflowList() {
    return (
      <div className="board-list">
        {workspace.boards.map((item) => (
          <button
            className={`board-item ${item.id === board.id ? 'active' : ''}`}
            key={item.id}
            aria-current={item.id === board.id ? true : undefined}
            onClick={() => {
              onSelectBoard(item.id);
              if (narrow) onMobileClose();
            }}
          >
            <Network size={16} />
            <span>{item.name}</span>
            <small>{item.nodes.length}</small>
          </button>
        ))}
      </div>
    );
  }

  function repositoryList() {
    return (
      <>
        {board.groups?.map((group) => (
          <div className="outline-group" key={group.id}>
            <button
              className={`outline-repo outline-group-title ${selectedGroup === group.id ? 'selected' : ''}`}
              aria-pressed={selectedGroup === group.id}
              onClick={() => {
                onSelectGroup(group.id);
                if (narrow) onMobileClose();
              }}
            >
              <Group size={14} />
              <span>{group.name}</span>
              <small>{group.nodeIds.length}</small>
            </button>
            {board.nodes
              .filter((node) => group.nodeIds.includes(node.id))
              .map((node) => repositoryItem(repositories.find((repo) => repo.id === node.repoId)!))}
          </div>
        ))}
        {repositories
          .filter(
            (repo) =>
              !board.groups?.some((group) =>
                group.nodeIds.some(
                  (id) => board.nodes.find((node) => node.id === id)?.repoId === repo.id,
                ),
              ),
          )
          .map(repositoryItem)}
      </>
    );
  }

  return (
    <>
      <aside
        id="workspace-navigation"
        ref={panelRef}
        className={`workspace-navigation ${mobileOpen ? 'mobile-open' : ''}`}
        data-collapsed={collapsed}
        aria-label={t('nav.flowNav')}
        role={narrow && mobileOpen ? 'dialog' : undefined}
        aria-modal={narrow && mobileOpen ? true : undefined}
        aria-hidden={(narrow && !mobileOpen) || undefined}
        inert={(narrow && !mobileOpen) || undefined}
        onKeyDown={onKeyDown}
      >
        <header className="navigation-brand">
          <div className="navigation-brand-identity">
            <a
              className={collapsed ? 'brand-mark' : 'brand-link'}
              href="/"
              aria-label={t('nav.home')}
            >
              <BrandLogo
                variant={collapsed ? 'icon' : 'full'}
                className={collapsed ? '' : 'workspace-logo'}
                decorative
              />
            </a>
            {!collapsed && (
              <span className="navigation-version" aria-label={t('brand.version', { version })}>
                {t('brand.versionShort', { version })}
              </span>
            )}
          </div>
          {!collapsed && (
            <div className="navigation-brand-actions">
              <IconButton label={t('nav.help')} onClick={onHelp}>
                <CircleHelp size={18} />
              </IconButton>
              {narrow && (
                <button
                  ref={closeRef}
                  className="icon-button"
                  aria-label={t('nav.close')}
                  onClick={onMobileClose}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}
        </header>
        <nav className="navigation-actions navigation-primary" aria-label={t('nav.main')}>
          {action(
            t('nav.canvas'),
            <Workflow size={20} />,
            () => {
              if (collapsed) updatePreferences({ navigationCollapsed: false });
              onCanvas();
              if (narrow) onMobileClose();
            },
            true,
          )}
          {action(t('nav.repositories'), <FolderGit2 size={20} />, onRepositories)}
        </nav>
        {collapsed && (
          <div className="navigation-actions navigation-collapsed-sections">
            <NavigationFlyout
              label={t('nav.workflows')}
              icon={<Network size={20} />}
              actions={
                <IconButton label={t('nav.create')} onClick={onCreate}>
                  <Plus size={16} />
                </IconButton>
              }
            >
              {workflowList()}
            </NavigationFlyout>
            <NavigationFlyout label={t('nav.onBoard')} icon={<FolderGit2 size={20} />}>
              {repositories.length ? (
                repositoryList()
              ) : (
                <p className="navigation-flyout-empty">{t('nav.onBoardEmpty')}</p>
              )}
            </NavigationFlyout>
          </div>
        )}
        <div
          id="workspace-navigation-content"
          className="navigation-scroll"
          hidden={collapsed}
          ref={scroll}
        >
          <div className="sidebar-section-heading">
            <span>{t('nav.workflows')}</span>
            <Tooltip content={t('nav.create')}>
              <button className="icon-button small" aria-label={t('nav.create')} onClick={onCreate}>
                <Plus size={16} />
              </button>
            </Tooltip>
          </div>
          {workflowList()}
          {repositories.length > 0 && (
            <section className="flow-outline">
              <div className="sidebar-section-heading">
                <span>{t('nav.onBoard')}</span>
                <FolderGit2 size={13} />
              </div>
              {repositoryList()}
            </section>
          )}
        </div>
        <div className="navigation-bottom">
          <div className="navigation-actions">
            {action(t('preferences.title'), <Settings2 size={20} />, onPreferences)}
            {collapsed && action(t('nav.help'), <CircleHelp size={20} />, onHelp)}
          </div>
        </div>
      </aside>
      {narrow && mobileOpen && (
        <button
          className="sidebar-scrim"
          tabIndex={-1}
          aria-label={t('nav.collapse')}
          onClick={onMobileClose}
        />
      )}
    </>
  );
}
