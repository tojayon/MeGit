import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryAvatar } from './RepositoryAvatar';
import {
  ArrowUpRight,
  CircleHelp,
  Eye,
  EyeOff,
  FolderCog,
  FolderGit2,
  Group,
  Network,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Settings2,
  Palette,
  X,
} from 'lucide-react';
import type { Board, FlowNode, Repository, Snapshot, Workspace } from '../../shared/types';
import { cardRefLabel, cardUsesWorktree } from '../../shared/card-refs';
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
  onRepositories,
  onCreate,
  workflowHidden,
  workflowAreaId,
  onToggleWorkflow,
  onPreferences,
  onSettings,
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
  onRepositories: () => void;
  onCreate: () => void;
  workflowHidden: boolean;
  workflowAreaId: string;
  onToggleWorkflow: () => void;
  onPreferences: () => void;
  onSettings: () => void;
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

  const workflowActions = (
    <div className="navigation-section-actions">
      <IconButton
        size="small"
        label={t(workflowHidden ? 'nav.showWorkflowPanel' : 'nav.hideWorkflowPanel')}
        aria-expanded={!workflowHidden}
        aria-controls={workflowAreaId}
        onClick={onToggleWorkflow}
      >
        {workflowHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </IconButton>
      <Tooltip content={t('nav.create')} className={collapsed ? undefined : 'navigation-trailing'}>
        <button
          type="button"
          className="icon-button small"
          aria-label={t('nav.create')}
          onClick={onCreate}
        >
          <Plus size={16} />
        </button>
      </Tooltip>
    </div>
  );

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
            document.querySelector<HTMLButtonElement>('.navigation-edge .navigation-toggle'),
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

  function action(label: string, icon: ReactNode, onClick: () => void) {
    return (
      <Tooltip content={label} placement="right">
        <button
          className="navigation-action"
          aria-label={label}
          onClick={onClick}
        >
          {icon}
          {!collapsed && <span>{label}</span>}
        </button>
      </Tooltip>
    );
  }

  function repositoryItem(node: FlowNode) {
    const repo = repositories.find((item) => item.id === node.repoId);
    if (!repo) return null;
    const state = snapshot?.repositories[repo.id];
    return (
      <button
        className={`outline-repo ${selectedRepo === node.id ? 'selected' : ''}`}
        key={node.id}
        aria-pressed={selectedRepo === node.id}
        onClick={() => {
          onSelectRepo(node.id);
          if (narrow) onMobileClose();
        }}
      >
        <span className="outline-repository-icon">
          <RepositoryAvatar repo={repo} size="small" />
          <span
            className={`status-dot ${state?.error ? 'error' : state?.changed && cardUsesWorktree(node.ref, state) ? 'modified' : ''}`}
          />
        </span>
        <span>{node.ref ? `${repo.name} · ${cardRefLabel(node.ref)}` : repo.name}</span>
        <span className="navigation-trailing outline-repo-link" aria-hidden="true">
          <ArrowUpRight size={13} />
        </span>
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
            <small className="navigation-trailing">{item.nodes.length}</small>
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
              <small className="navigation-trailing">{group.nodeIds.length}</small>
            </button>
            {board.nodes.filter((node) => group.nodeIds.includes(node.id)).map(repositoryItem)}
          </div>
        ))}
        {board.nodes
          .filter((node) => !board.groups?.some((group) => group.nodeIds.includes(node.id)))
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
              <BrandLogo variant="full" className="workspace-logo" decorative />
              <BrandLogo variant="icon" className="workspace-logo-symbol" decorative />
            </a>
            {!collapsed && (
              <span className="navigation-version" aria-label={t('brand.version', { version })}>
                {t('brand.versionShort', { version })}
              </span>
            )}
          </div>
          {narrow && (
            <div className="navigation-brand-actions">
              <button
                ref={closeRef}
                className="icon-button"
                aria-label={t('nav.close')}
                onClick={onMobileClose}
              >
                <X size={18} />
              </button>
            </div>
          )}
        </header>
        {collapsed && (
          <div className="navigation-actions navigation-collapsed-sections">
            <NavigationFlyout
              label={t('nav.workflows')}
              icon={<Network size={20} />}
              actions={workflowActions}
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
            {!collapsed && workflowActions}
          </div>
          {workflowList()}
          {repositories.length > 0 && (
            <section className="flow-outline">
              <div className="sidebar-section-heading">
                <span>{t('nav.onBoard')}</span>
                <span className="navigation-trailing" aria-hidden="true">
                  <FolderGit2 size={13} />
                </span>
              </div>
              {repositoryList()}
            </section>
          )}
        </div>
        <div className="navigation-bottom">
          <div className="navigation-actions">
            <div className="navigation-collapse-control">
              <span className="navigation-divider" aria-hidden="true" />
              {!narrow && (
                <IconButton
                  label={t(collapsed ? 'nav.expand' : 'nav.collapse')}
                  placement="right"
                  className="navigation-toggle"
                  aria-expanded={!collapsed}
                  aria-controls="workspace-navigation"
                  onClick={() => updatePreferences({ navigationCollapsed: !collapsed })}
                >
                  {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
                </IconButton>
              )}
            </div>
            {action(t('nav.repositories'), <FolderCog size={20} />, onRepositories)}
            {action(t('preferences.title'), <Palette size={20} />, onPreferences)}
            {action(t('nav.help'), <CircleHelp size={20} />, onHelp)}
            {action(t('settings.title'), <Settings2 size={20} />, onSettings)}
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
