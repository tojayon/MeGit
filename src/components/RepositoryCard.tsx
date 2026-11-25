import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  CircleAlert,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Maximize2,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { GitAction, RepoState, Repository } from '../../shared/types';
import { actionArguments } from '../../shared/git-commands';
import { formatError } from '../lib/messages';
import { RepositoryAvatar } from './RepositoryAvatar';
import { IconButton } from './IconButton';
import { CommitMessageDialog } from './CommitMessageDialog';
import { GitHelp } from './GitHelp';
import { Tooltip } from './Tooltip';
import { GitCommandPreview } from './GitCommandPreview';
import { diffOptions } from '../../shared/git-commands';

export function RepositoryCard({
  repo,
  state,
  selected,
  message,
  onMessage,
  busy,
  onAction,
  onGenerate,
  onOpen,
  onWorktree,
  children,
  serviceControls,
  reference,
  referenceMissing,
  showWorktree = true,
}: {
  repo: Repository;
  state?: RepoState;
  selected?: boolean;
  message: string;
  onMessage: (value: string) => void;
  busy: string;
  onAction: (action: GitAction) => Promise<boolean>;
  onGenerate: () => Promise<boolean>;
  onOpen: () => void;
  onWorktree?: () => void;
  children?: ReactNode;
  serviceControls?: ReactNode;
  reference?: string;
  referenceMissing?: boolean;
  showWorktree?: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState(false);
  const paths =
    state?.files
      .filter((file) => file.untracked || file.worktreeStatus !== '.')
      .map((file) => file.path) || [];
  const staged =
    state?.files.filter((file) => !file.untracked && file.indexStatus !== '.').length || 0;
  const conflicts = state?.files.filter((file) => file.conflicted).length || 0;
  const blocked = !showWorktree || !!busy || !state || !!state.error;
  const canCommit = !blocked && !conflicts && staged > 0 && !!message.trim();
  const canGenerate = !blocked && !conflicts && staged > 0;
  const openLabel = t('repository.viewNamed', {
    name: reference ? `${repo.name} · ${reference}` : repo.name,
  });
  function worktreeCount(kind: 'modified' | 'staged', count: number) {
    const label = t(`repositoryCard.${kind}Count`, { count });
    const className = `repository-card-count ${kind}`;
    return (
      <Tooltip content={t(`repositoryCard.${kind}Help`)}>
        {onWorktree ? (
          <button
            type="button"
            className={`${className} nodrag nopan`}
            aria-haspopup="dialog"
            onClick={(event) => {
              event.stopPropagation();
              onWorktree();
            }}
          >
            {label}
          </button>
        ) : (
          <span className={className} tabIndex={0}>
            {label}
          </span>
        )}
      </Tooltip>
    );
  }
  async function generate() {
    if (!canGenerate) return;
    setError(null);
    try {
      await onGenerate();
    } catch (reason) {
      setError(reason);
    }
  }
  async function run(action: GitAction) {
    if (blocked || (action.type === 'commit' && !canCommit)) return;
    setError(null);
    try {
      await onAction(action);
    } catch (reason) {
      setError(reason);
    }
  }
  return (
    <article
      className={`repository-node repository-card ${selected ? 'is-selected' : ''}`}
      data-testid="repository-node"
    >
      {children}
      <div className="repository-card-heading">
        <RepositoryAvatar repo={repo} size="large" />
        <div className="repository-card-identity">
          <div className="repository-card-title-row">
            <h3 aria-label={repo.name}>
              <Tooltip content={openLabel}>
                <button
                  type="button"
                  className="repository-card-title-button nodrag nopan"
                  aria-label={openLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                  }}
                >
                  {repo.name}
                </button>
              </Tooltip>
            </h3>
          </div>
          {state?.error ? (
            <p className="repository-card-status danger-text">
              <CircleAlert size={14} />
              {t('repository.unavailable')}
            </p>
          ) : referenceMissing ? (
            <p className="repository-card-status danger-text" role="status">
              {reference} · {t('repositoryCard.refMissing')}
            </p>
          ) : !state ? (
            <p className="repository-card-status">
              <LoaderCircle size={14} className="spin" />
              {t('repository.reading')}
            </p>
          ) : (
            <div className="repository-card-meta">
              <GitBranch size={13} />
              <span
                className="repository-card-branch"
                title={reference || (state.detached ? t('repository.detached') : state.branch)}
              >
                {reference ||
                  (state.detached
                    ? t('repository.detached')
                    : state.branch || t('repository.unknownBranch'))}
              </span>
              {showWorktree && (
                <>
                  <span className="repository-card-divider" aria-hidden="true">
                    |
                  </span>
                  {worktreeCount('modified', paths.length)}
                  <span className="repository-card-divider" aria-hidden="true">
                    |
                  </span>
                  {worktreeCount('staged', staged)}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {serviceControls}
      {showWorktree && (
        <>
          <form
            className="repository-card-actions nodrag nopan nowheel"
            aria-label={t('repository.commitSection')}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (canCommit) void run({ type: 'commit', message });
            }}
          >
            <IconButton
              size="small"
              className="repository-card-stage"
              label={t('repository.stageAll')}
              disabled={blocked || !paths.length}
              busy={busy === 'stage'}
              help={
                <GitHelp
                  topic="stage"
                  preview={{ commands: [actionArguments({ type: 'stage', paths }, state)] }}
                />
              }
              onClick={() => void run({ type: 'stage', paths })}
            >
              <Plus size={16} />
            </IconButton>
            <div className="repository-card-message">
              <IconButton
                size="small"
                label={t('repository.expandMessage')}
                onClick={() => setExpanded(true)}
              >
                <Maximize2 size={14} />
              </IconButton>
              <textarea
                aria-label={t('repository.message')}
                placeholder={t('repository.messagePlaceholder')}
                value={message}
                maxLength={10000}
                disabled={!!busy}
                rows={1}
                wrap="off"
                onChange={(event) => onMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  if (event.shiftKey) setExpanded(true);
                  else if (canCommit) event.currentTarget.form?.requestSubmit();
                }}
              />
              <IconButton
                size="small"
                label={t('repositoryCard.aiMessage')}
                help={
                  <span className="git-help-content">
                    <strong>{t('repositoryCard.aiMessage')}</strong>
                    <span>{t('repositoryCard.aiHelp')}</span>
                    {!state && <span>{t('repository.reading')}</span>}
                    {!!state?.error && <span>{t('repository.unavailable')}</span>}
                    {!staged && <span>{t('errors.stageRequired')}</span>}
                    {!!conflicts && <span>{t('errors.resolveConflicts')}</span>}
                    <GitCommandPreview
                      when="read"
                      commands={[['diff', '--cached', ...diffOptions]]}
                    />
                  </span>
                }
                aria-disabled={!canGenerate}
                busy={busy === 'aiCommit'}
                onClick={() => void generate()}
              >
                <Sparkles size={14} />
              </IconButton>
            </div>
            <IconButton
              type="submit"
              size="small"
              className="repository-card-commit"
              label={t('repositoryCard.commit')}
              disabled={!canCommit}
              busy={busy === 'commit'}
              help={
                <GitHelp
                  topic="commit"
                  preview={{ commands: [actionArguments({ type: 'commit', message }, state)] }}
                />
              }
            >
              <GitCommitHorizontal size={17} />
            </IconButton>
          </form>
          {conflicts > 0 && (
            <p className="repository-card-notice danger-text" role="status">
              {t('repository.conflicts', { count: conflicts })}
            </p>
          )}
          {!!error && (
            <p className="repository-card-notice error-message" role="alert">
              {formatError(error)}
            </p>
          )}
          {expanded &&
            createPortal(
              <CommitMessageDialog
                message={message}
                onMessage={onMessage}
                disabled={!!busy}
                onClose={() => setExpanded(false)}
              />,
              document.body,
            )}
        </>
      )}
    </article>
  );
}
