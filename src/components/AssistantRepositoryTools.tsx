import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RepoState, Repository, GitAction } from '../../shared/types';
import { useRepositoryActions } from '../lib/use-repository-actions';
import { formatError } from '../lib/messages';
import { RepositoryToolsPanel, RepositoryPanel } from './RepositoryPanel';
import { RepositoryAvatar } from './RepositoryAvatar';
import { Dialog } from './Dialogs';

export function AssistantRepositoryTools({
  repo,
  state,
  view,
  actionViewKey,
  onClose,
  onState,
  onRefresh,
  disabled,
}: {
  repo: Repository;
  state: RepoState;
  view: 'worktree' | 'branches';
  actionViewKey?: string;
  onClose: () => void;
  onState: (state: RepoState) => void;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>();
  const actions = useRepositoryActions({
    repo,
    viewKey: actionViewKey ?? `assistant.repository.${repo.id}`,
    onState,
    onRefresh,
    onNotice: () => {},
  });
  async function handleAction(action: GitAction) {
    try {
      setError(undefined);
      await actions.executeAction(action);
    } catch (failure) {
      setError(failure);
    }
  }
  return (
    <Dialog
      title={t(view === 'worktree' ? 'repository.worktree' : 'assistantGuidance.branches')}
      titleIcon={<RepositoryAvatar repo={repo} size="small" />}
      titleDetail={
        <span>
          {repo.name} · {state.branch}
        </span>
      }
      className={
        view === 'worktree'
          ? 'repository-tools-dialog worktree-detail-dialog'
          : 'assistant-repository-dialog'
      }
      wide
      busy={!!actions.busy}
      onClose={onClose}
    >
      <div className="dialog-body">
        {!!error && (
          <p role="alert" className="error-message">
            {formatError(error)}
          </p>
        )}
        {view === 'worktree' ? (
          <RepositoryToolsPanel
            repo={repo}
            state={state}
            tab="worktree"
            message={actions.message}
            setMessage={actions.setMessage}
            busy={disabled ? 'assistant' : actions.busy}
            handleAction={handleAction}
            onAction={actions.executeAction}
            onGenerateCommit={actions.generateCommit}
          />
        ) : (
          <RepositoryPanel
            repo={repo}
            state={state}
            actionViewKey={actionViewKey}
            onClose={onClose}
            onRefresh={onRefresh}
            onState={onState}
            onNotice={(notice, failed) => {
              if (failed) setError(notice);
            }}
          />
        )}
      </div>
    </Dialog>
  );
}
