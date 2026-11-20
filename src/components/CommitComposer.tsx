import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GitCommitHorizontal, Maximize2, Minus, Plus, Sparkles } from 'lucide-react';
import type { GitAction, RepoState } from '../../shared/types';
import { actionArguments } from '../../shared/git-commands';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Field } from './Field';
import { GitHelp, HelpTip } from './GitHelp';
import { Tooltip } from './Tooltip';
import { CommitMessageDialog } from './CommitMessageDialog';
import { IconButton } from './IconButton';

export function CommitStageButton({
  type,
  paths,
  state,
  busy,
  disabled,
  compact,
  onAction,
}: {
  type: 'stage' | 'unstage';
  paths: string[];
  state?: RepoState;
  busy: string;
  disabled?: boolean;
  compact?: boolean;
  onAction: (action: GitAction) => Promise<void>;
}) {
  const { t } = useTranslation();
  const label = t(type === 'stage' ? 'repository.stageAll' : 'repository.unstageAll');
  return (
    <Tooltip
      detailed
      content={
        <GitHelp topic={type} preview={{ commands: [actionArguments({ type, paths }, state)] }} />
      }
    >
      <Button
        size="compact"
        className={compact ? `branch-detail-action branch-detail-${type}` : undefined}
        aria-label={label}
        icon={type === 'stage' ? <Plus size={15} /> : <Minus size={15} />}
        disabled={disabled || !!busy || !paths.length}
        busy={busy === type}
        onClick={() => void onAction({ type, paths })}
      >
        {label}
      </Button>
    </Tooltip>
  );
}

export function CommitComposer({
  state,
  message,
  onMessage,
  busy,
  disabled = false,
  showFileCount = true,
  onAction,
  onGenerate,
  children,
}: {
  state?: RepoState;
  message: string;
  onMessage: (value: string) => void;
  busy: string;
  disabled?: boolean;
  showFileCount?: boolean;
  onAction: (action: GitAction) => Promise<boolean>;
  onGenerate?: () => Promise<boolean>;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState(false);
  const staged = state?.files.filter((file) => !file.untracked && file.indexStatus !== '.') || [];
  const unstaged =
    state?.files.filter((file) => file.untracked || file.worktreeStatus !== '.') || [];
  const conflicts = state?.files.some((file) => file.conflicted);
  const blocked = disabled || !!busy || !state || !!state.error;
  const canCommit = !blocked && !conflicts && staged.length > 0 && !!message.trim();
  async function run(action: GitAction) {
    if (blocked || (action.type === 'commit' && !canCommit)) return;
    setError(null);
    try {
      await onAction(action);
    } catch (err) {
      setError(err);
    }
  }
  async function generate() {
    if (!onGenerate || blocked || conflicts || !staged.length) return;
    setError(null);
    try {
      await onGenerate();
    } catch (err) {
      setError(err);
    }
  }
  const stageActions = (
    <div className="commit-stage-actions">
      {(['stage', 'unstage'] as const).map((type) => (
        <CommitStageButton
          key={type}
          type={type}
          paths={(type === 'stage' ? unstaged : staged).map((file) => file.path)}
          state={state}
          busy={busy}
          disabled={blocked}
          compact={!!onGenerate}
          onAction={run}
        />
      ))}
    </div>
  );
  const commitButton = (
    <Tooltip
      detailed
      content={
        <GitHelp
          topic="commit"
          preview={{ commands: [actionArguments({ type: 'commit', message }, state)] }}
        />
      }
    >
      <Button
        type="submit"
        variant="primary"
        className="git-action-tone"
        data-action="commit"
        icon={<GitCommitHorizontal size={16} />}
        busy={busy === 'commit'}
        disabled={!canCommit}
      >
        {showFileCount
          ? t('repository.commitFiles', { count: staged.length })
          : t('repositoryCard.commit')}
      </Button>
    </Tooltip>
  );
  const messageProps = {
    value: message,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onMessage(event.target.value),
    placeholder: t('repository.messagePlaceholder'),
    maxLength: 10000,
    disabled: !!busy,
  };
  return (
    <>
      <form
        className={`commit-form commit-composer${onGenerate ? ' commit-composer-compact' : ''}`}
        aria-label={t('repository.commitSection')}
        onSubmit={(event) => {
          event.preventDefault();
          if (canCommit) void run({ type: 'commit', message });
        }}
      >
        {onGenerate ? (
          <>
            {children ?? (
              <div className="commit-compact-summary">
                <div className="commit-compact-counts">
                  <span>{t('repositoryCard.modifiedCount', { count: unstaged.length })}</span>
                  <span aria-hidden="true">|</span>
                  <span>{t('repositoryCard.stagedCount', { count: staged.length })}</span>
                  <HelpTip topic="unstaged" related={['staged']} />
                </div>
                {stageActions}
              </div>
            )}
            <div className="commit-compact-row">
              <div className="commit-compact-field">
                <IconButton
                  size="small"
                  label={t('repository.expandMessage')}
                  onClick={() => setExpanded(true)}
                >
                  <Maximize2 size={14} />
                </IconButton>
                <textarea
                  {...messageProps}
                  aria-label={t('repository.message')}
                  rows={1}
                  wrap="off"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      if (event.shiftKey) setExpanded(true);
                    }
                  }}
                />
                <IconButton
                  size="small"
                  label={t('repositoryCard.aiMessage')}
                  help={t(
                    !staged.length
                      ? 'errors.stageRequired'
                      : conflicts
                        ? 'errors.resolveConflicts'
                        : 'repositoryCard.aiHelp',
                  )}
                  busy={busy === 'aiCommit'}
                  aria-disabled={blocked || conflicts || !staged.length}
                  onClick={() => void generate()}
                >
                  <Sparkles size={14} />
                </IconButton>
              </div>
              {commitButton}
            </div>
          </>
        ) : (
          <>
            <div className="commit-help">
              <HelpTip topic="commit" />
            </div>
            <Field label={t('repository.message')}>
              <textarea {...messageProps} rows={3} />
            </Field>
            {stageActions}
            {commitButton}
          </>
        )}
        {conflicts ? (
          <p className="warning-text" role="status">
            {t('errors.resolveConflicts')}
          </p>
        ) : !onGenerate && state && !staged.length && !!state.changed ? (
          <p className="muted commit-stage-hint">{t('errors.stageRequired')}</p>
        ) : null}
        {!!error && (
          <p className="error-message" role="alert">
            {formatError(error)}
          </p>
        )}
      </form>
      {expanded && (
        <CommitMessageDialog
          message={message}
          onMessage={onMessage}
          disabled={!!busy}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}
