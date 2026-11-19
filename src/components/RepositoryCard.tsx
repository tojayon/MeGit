import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  CircleAlert,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { GitAction, RepoState, Repository } from '../../shared/types';
import { actionArguments } from '../../shared/git-commands';
import { formatError } from '../lib/messages';
import { RepositoryAvatar } from './RepositoryAvatar';
import { IconButton } from './IconButton';
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
  children,
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
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const paths =
    state?.files
      .filter((file) => file.untracked || file.worktreeStatus !== '.')
      .map((file) => file.path) || [];
  const staged =
    state?.files.filter((file) => !file.untracked && file.indexStatus !== '.').length || 0;
  const conflicts = state?.files.filter((file) => file.conflicted).length || 0;
  const blocked = !!busy || !state || !!state.error;
  const canCommit = !blocked && !conflicts && staged > 0 && !!message.trim();
  const canGenerate = !blocked && !conflicts && staged > 0;
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
            <h3 title={repo.name}>{repo.name}</h3>
            <IconButton
              className="repository-card-open nodrag nopan"
              label={t('repository.viewNamed', { name: repo.name })}
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              <ArrowUpRight size={14} />
            </IconButton>
          </div>
          {state?.error ? (
            <p className="repository-card-status danger-text">
              <CircleAlert size={14} />
              {t('repository.unavailable')}
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
                title={state.detached ? t('repository.detached') : state.branch}
              >
                {state.detached
                  ? t('repository.detached')
                  : state.branch || t('repository.unknownBranch')}
              </span>
              <span className="repository-card-divider" aria-hidden="true">
                |
              </span>
              <Tooltip content={t('repositoryCard.modifiedHelp')}>
                <span className="repository-card-count modified" tabIndex={0}>
                  {t('repositoryCard.modifiedCount', { count: paths.length })}
                </span>
              </Tooltip>
              <span className="repository-card-divider" aria-hidden="true">
                |
              </span>
              <Tooltip content={t('repositoryCard.stagedHelp')}>
                <span className="repository-card-count staged" tabIndex={0}>
                  {t('repositoryCard.stagedCount', { count: staged })}
                </span>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
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
          <input
            aria-label={t('repository.message')}
            placeholder={t('repository.messagePlaceholder')}
            value={message}
            maxLength={10000}
            disabled={!!busy}
            onChange={(event) => onMessage(event.target.value)}
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
                <GitCommandPreview when="read" commands={[['diff', '--cached', ...diffOptions]]} />
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
    </article>
  );
}
