import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { actionArguments } from '../../shared/git-commands';
import type { RepoState, SyncAction } from '../../shared/types';
import { formatError } from '../lib/messages';
import type { RelationShortcut } from '../lib/relation-actions';
import { Button } from './Button';
import { GitHelp } from './GitHelp';
import { RelationActionConfirmation } from './RelationActionDialog';
import { RelationActionIcon } from './RelationActionIcon';
import { Tooltip } from './Tooltip';

export function RepositorySyncButtons({
  repositoryName,
  state,
  busy,
  disabled,
  compact,
  onAction,
}: {
  repositoryName: string;
  state?: RepoState;
  busy?: string;
  disabled?: boolean;
  compact?: boolean;
  onAction: (action: SyncAction) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{
    action: SyncAction;
    shortcut: RelationShortcut;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pushTarget = state?.pushTarget;
  const unavailable =
    disabled || !!busy || !!state?.error || !!state?.detached || !!state?.operation ||
    !state?.branch || !state.head || !state.upstreamHead || !pushTarget;
  const hasPending = { pull: (state?.behind ?? 0) > 0, push: (state?.ahead ?? 0) > 0 };

  function open(type: SyncAction['type']) {
    if (unavailable || !state?.head || !state.upstreamHead || !pushTarget) return;
    const local = `${repositoryName} · ${state.branch}`;
    const upstream = `${repositoryName} · ${pushTarget.remote}/${pushTarget.ref.slice('refs/heads/'.length)}`;
    setError(null);
    setPending({
      action: {
        type,
        expected: { ...pushTarget, branch: state.branch, head: state.head, upstreamHead: state.upstreamHead },
      },
      shortcut: {
        type,
        from: type === 'pull' ? upstream : local,
        to: type === 'pull' ? local : upstream,
        recommended: hasPending[type],
      },
    });
  }

  return (
    <>
      {(['pull', 'push'] as const).map((type) => (
        <Tooltip
          key={type}
          detailed
          content={
            <GitHelp topic={type} preview={{ when: 'confirm', commands: [actionArguments({ type }, state)] }} />
          }
        >
          <Button
            size={compact ? 'compact' : 'default'}
            className={compact ? 'relation-sync-button branch-detail-action' : 'relation-sync-button'}
            data-action={type}
            data-pending={hasPending[type]}
            aria-label={t(`repository.${type}`)}
            aria-haspopup="dialog"
            icon={<RelationActionIcon action={type} size={15} />}
            disabled={unavailable}
            busy={busy === type}
            onClick={() => open(type)}
          >
            {t(`repository.${type}`)}
          </Button>
        </Tooltip>
      ))}
      {pending && (
        <RelationActionConfirmation
          shortcut={pending.shortcut}
          busy={submitting}
          disabled={unavailable || !!error}
          error={error ? formatError(error) : undefined}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            setSubmitting(true);
            try {
              if (await onAction(pending.action)) setPending(null);
            } catch (failure) {
              setError(failure);
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}
    </>
  );
}
