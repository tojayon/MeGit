import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitCommitHorizontal, Minus, Plus } from 'lucide-react';
import type { GitAction, RepoState } from '../../shared/types';
import { actionArguments } from '../../shared/git-commands';
import { formatError } from '../lib/messages';
import { Button } from './Button';
import { Field } from './Field';
import { GitHelp, HelpTip } from './GitHelp';
import { Tooltip } from './Tooltip';

export function CommitComposer({
  state,
  message,
  onMessage,
  busy,
  disabled = false,
  onAction,
}: {
  state?: RepoState;
  message: string;
  onMessage: (value: string) => void;
  busy: string;
  disabled?: boolean;
  onAction: (action: GitAction) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
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
  return (
    <form
      className="commit-form commit-composer"
      aria-label={t('repository.commitSection')}
      onSubmit={(event) => {
        event.preventDefault();
        if (canCommit) void run({ type: 'commit', message });
      }}
    >
      <div className="commit-help">
        <HelpTip topic="commit" />
      </div>
      <Field label={t('repository.message')}>
        <textarea
          value={message}
          onChange={(event) => onMessage(event.target.value)}
          placeholder={t('repository.messagePlaceholder')}
          rows={3}
          maxLength={10000}
          disabled={!!busy}
        />
      </Field>
      <div className="commit-stage-actions">
        {(['stage', 'unstage'] as const).map((type) => {
          const paths = (type === 'stage' ? unstaged : staged).map((file) => file.path);
          return (
            <Tooltip
              key={type}
              detailed
              content={
                <GitHelp
                  topic={type}
                  preview={{ commands: [actionArguments({ type, paths }, state)] }}
                />
              }
            >
              <Button
                size="compact"
                icon={type === 'stage' ? <Plus size={15} /> : <Minus size={15} />}
                disabled={blocked || !paths.length}
                busy={busy === type}
                onClick={() => void run({ type, paths })}
              >
                {t(type === 'stage' ? 'repository.stageAll' : 'repository.unstageAll')}
              </Button>
            </Tooltip>
          );
        })}
      </div>
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
          icon={<GitCommitHorizontal size={16} />}
          busy={busy === 'commit'}
          disabled={!canCommit}
        >
          {t('repository.commitFiles', { count: staged.length })}
        </Button>
      </Tooltip>
      {conflicts ? (
        <p className="warning-text" role="status">
          {t('errors.resolveConflicts')}
        </p>
      ) : state && !staged.length && !!state.changed ? (
        <p className="muted commit-stage-hint">{t('errors.stageRequired')}</p>
      ) : null}
      {!!error && (
        <p className="error-message" role="alert">
          {formatError(error)}
        </p>
      )}
    </form>
  );
}
