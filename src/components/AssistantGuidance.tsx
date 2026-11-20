import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, FileCode2, GitBranch, RefreshCw } from 'lucide-react';
import type { RepoState, Repository } from '../../shared/types';
import {
  availableAssistantGuides,
  defaultAssistantGuides,
  type AssistantGuide,
  type AssistantGuideKind,
} from '../../shared/assistant-guidance';
import { request } from '../lib/api';
import { useRepositoryActions } from '../lib/use-repository-actions';
import { formatError, type ApiError } from '../lib/messages';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { GitHelp } from './GitHelp';
import { actionArguments, statusArguments } from '../../shared/git-commands';
import { GitCommandPreview } from './GitCommandPreview';
import { RemoteActionButton } from './RemoteActionButton';
import { RemoteActionDialog } from './RemoteActionDialog';
import { RemoteAccessRow, RemoteGitHubLogin } from './RemoteAccess';
import { AssistantRepositoryTools } from './AssistantRepositoryTools';
import { Dialog } from './Dialogs';
import './assistant-guidance.css';

export function guidanceForError(repositoryIds: string[], code?: string): AssistantGuide[] {
  const kinds: Partial<Record<string, AssistantGuideKind[]>> = {
    noRemote: ['addRemote'],
    noUpstream: ['setTracking', 'publishBranch', 'fetch'],
    upstreamUnavailable: ['fetch', 'setTracking'],
    stageRequired: ['worktree'],
    resolveConflicts: ['worktree'],
    branchOperation: ['worktree'],
    dirtyPull: ['worktree'],
    dirtyBranch: ['worktree'],
    branchNoCommits: ['worktree'],
    remoteNotConfigured: ['remotes'],
    pushNeedsFetch: ['fetch'],
    pushNonFastForward: ['branches'],
    pushConfig: ['remotes'],
    remoteRefMissing: ['remotes'],
    remoteReadAuth: ['remotes'],
    remoteReadNetwork: ['remotes'],
    remoteReadLocal: ['remotes'],
    gitFailed: ['remotes'],
  };
  return repositoryIds.flatMap((repositoryId) =>
    (kinds[code || ''] || []).map((kind) => ({ repositoryId, kind })),
  );
}

export function AssistantGuidance({
  guides,
  repositories,
  disabled,
  onRefresh,
  onContinue,
  onRepositories,
  actionViewKey,
}: {
  guides: AssistantGuide[];
  repositories: Repository[];
  disabled?: boolean;
  onRefresh: () => Promise<void>;
  onContinue: () => void;
  onRepositories?: () => void;
  actionViewKey?: (repo: Repository) => string;
}) {
  return (
    <div className="assistant-guidance-list">
      {[...new Set(guides.map((guide) => guide.repositoryId))].map((id) => {
        const repo = repositories.find((item) => item.id === id && !item.archived);
        return repo ? (
          <RepositoryGuidance
            key={`${id}:${repo.path}`}
            repo={repo}
            kinds={guides.filter((guide) => guide.repositoryId === id).map((guide) => guide.kind)}
            disabled={disabled}
            onRefresh={onRefresh}
            onContinue={onContinue}
            onRepositories={onRepositories}
            actionViewKey={actionViewKey?.(repo)}
          />
        ) : null;
      })}
    </div>
  );
}

function RepositoryGuidance({
  repo,
  kinds,
  disabled,
  onRefresh,
  onContinue,
  onRepositories,
  actionViewKey,
}: {
  repo: Repository;
  kinds: AssistantGuideKind[];
  disabled?: boolean;
  onRefresh: () => Promise<void>;
  onContinue: () => void;
  onRepositories?: () => void;
  actionViewKey?: string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<RepoState>();
  const [error, setError] = useState<unknown>();
  const [checking, setChecking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [view, setView] = useState<AssistantGuideKind | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const alive = useRef(true);
  const revision = useRef(0);
  const reload = async () => {
    const version = ++revision.current;
    const next = await request<RepoState>(
      `/ai/assistant/repositories/${encodeURIComponent(repo.id)}`,
    );
    if (alive.current && version === revision.current) {
      setState(next);
      setError(undefined);
    }
    return next;
  };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const load = () => {
      const version = ++revision.current;
      void request<RepoState>(`/ai/assistant/repositories/${encodeURIComponent(repo.id)}`, {
        signal: controller.signal,
      })
        .then((next) => {
          if (!controller.signal.aborted && version === revision.current) {
            setState(next);
            setError(undefined);
          }
        })
        .catch((failure) => {
          if (!controller.signal.aborted && version === revision.current) setError(failure);
        });
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      alive.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [repo.id, repo.path]);
  const actions = useRepositoryActions({
    repo,
    viewKey: actionViewKey,
    onState: setState,
    onRefresh: async () => {
      await reload();
      await onRefresh();
    },
    onNotice: () => {
      setCompleted(true);
    },
  });
  const available = state ? availableAssistantGuides(state) : [];
  const valid = [...new Set(kinds)].filter((kind) => available.includes(kind));
  const busy = disabled || checking || !!actions.busy;
  async function open(kind: AssistantGuideKind) {
    if (busy) return;
    setChecking(true);
    setError(undefined);
    try {
      const next = await reload();
      if (!alive.current) return;
      if (!availableAssistantGuides(next).includes(kind)) {
        setCompleted(true);
        return;
      }
      setView(kind);
    } catch (failure) {
      if (alive.current) setError(failure);
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function fetchRemote() {
    if (busy) return;
    setChecking(true);
    try {
      setError(undefined);
      const next = await reload();
      if (!next.remotes.length) {
        setView(null);
        return;
      }
      if (await actions.executeAction({ type: 'fetch' })) setView(null);
    } catch (failure) {
      setError(failure);
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  const missing = !valid.length && !!state && !state.error;
  const nextGuides =
    state && missing ? defaultAssistantGuides(state).filter((kind) => !kinds.includes(kind)) : [];
  const remoteAction =
    view === 'addRemote' || view === 'setTracking' || view === 'publishBranch' ? view : null;
  return (
    <section
      className="assistant-guidance"
      aria-label={t('assistantGuidance.forRepository', { name: repo.name })}
    >
      <strong>{repo.name}</strong>
      <div className="assistant-guidance-actions">
        {!state && !error && <span role="status">{t('assistantGuidance.checking')}</span>}
        <AssistantGuideButtons
          kinds={[...valid, ...nextGuides]}
          state={state}
          disabled={busy}
          onOpen={(kind) => void open(kind)}
        />
        {(completed || missing) && (
          <>
            <span role="status">{t('assistantGuidance.updated')}</span>
            <Tooltip content={t('assistantGuidance.continueHelp')}>
              <Button size="compact" disabled={busy} onClick={onContinue}>
                {t('assistantGuidance.continue')}
              </Button>
            </Tooltip>
          </>
        )}
        {!!error && (
          <Button
            size="compact"
            disabled={busy}
            onClick={() => {
              setError(undefined);
              void reload().catch(setError);
            }}
          >
            {t('assistantGuidance.refresh')}
          </Button>
        )}
        {!!error &&
          onRepositories &&
          [
            'repositoryMissing',
            'repositoryMoved',
            'repositoryArchived',
            'directoryMissing',
            'notRepository',
          ].includes((error as ApiError).code) && (
            <Button size="compact" onClick={onRepositories}>
              {t('nav.repositories')}
            </Button>
          )}
      </div>
      {!!error && (
        <p role="alert" className="error-message">
          {formatError(error)}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="error-message">
          {formatError(state.errorInfo || new Error(state.error))}
        </p>
      )}
      {state?.error && (
        <Button size="compact" disabled={busy} onClick={() => void reload().catch(setError)}>
          {t('assistantGuidance.refresh')}
        </Button>
      )}
      {state && remoteAction && (
        <RemoteActionDialog
          type={remoteAction}
          state={state}
          busy={!!actions.busy || !!disabled}
          onAction={actions.executeAction}
          onClose={() => setView(null)}
        />
      )}
      {state && (view === 'branches' || view === 'worktree') && (
        <AssistantRepositoryTools
          repo={repo}
          state={state}
          view={view}
          disabled={disabled}
          actionViewKey={actionViewKey}
          onState={setState}
          onRefresh={async () => {
            await reload();
            await onRefresh();
            setCompleted(true);
          }}
          onClose={() => { setView(null); setCompleted(true); }}
        />
      )}
      {state && view === 'fetch' && (
        <Dialog
          title={t('assistantGuidance.fetch')}
          busy={checking || !!actions.busy}
          onClose={() => setView(null)}
        >
          <div className="dialog-body">
            <strong>{repo.name}</strong>
            <GitHelp
              topic="fetch"
              preview={{ when: 'confirm', commands: [actionArguments({ type: 'fetch' }, state)] }}
            />
            {!!error && (
              <p role="alert" className="error-message">
                {formatError(error)}
              </p>
            )}
          </div>
          <footer className="dialog-footer">
            <Button disabled={busy} onClick={() => setView(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              busy={checking || !!actions.busy}
              onClick={() => void fetchRemote()}
            >
              {t('repository.fetch')}
            </Button>
          </footer>
        </Dialog>
      )}
      {state && view === 'remotes' && (
        <Dialog title={t('repository.manageRemotes')} onClose={() => { setView(null); setCompleted(true); }}>
          <div className="dialog-body">
            <strong>{repo.name}</strong>
            <ul className="remote-management-list">
              {state.remotes.map((name) => (
                <RemoteAccessRow
                  key={name}
                  repoId={repo.id}
                  name={name}
                  disabled={!!busy}
                  onLogin={() => setLogin(name)}
                />
              ))}
            </ul>
          </div>
        </Dialog>
      )}
      {login && <RemoteGitHubLogin repoId={repo.id} name={login} onClose={() => setLogin(null)} />}
    </section>
  );
}

export function AssistantGuideButtons({
  kinds,
  state,
  disabled,
  onOpen,
}: {
  kinds: AssistantGuideKind[];
  state?: RepoState;
  disabled?: boolean;
  onOpen: (kind: AssistantGuideKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {[...new Set(kinds)].map((kind) =>
        kind === 'addRemote' || kind === 'setTracking' || kind === 'publishBranch' ? (
          <RemoteActionButton
            key={kind}
            type={kind}
            state={state}
            disabled={disabled}
            onClick={() => onOpen(kind)}
          />
        ) : (
          <Tooltip
            key={kind}
            detailed
            content={
              kind === 'fetch' ? (
                <GitHelp
                  topic="fetch"
                  preview={{
                    when: 'confirm',
                    commands: state ? [actionArguments({ type: 'fetch' }, state)] : [],
                  }}
                />
              ) : (
                <>
                  <span>{t(`assistantGuidance.help.${kind}`)}</span>
                  <GitCommandPreview when="read" commands={[statusArguments]} />
                </>
              )
            }
          >
            <Button
              size="compact"
              disabled={disabled}
              icon={
                kind === 'worktree' ? (
                  <FileCode2 size={15} />
                ) : kind === 'branches' ? (
                  <GitBranch size={15} />
                ) : kind === 'fetch' ? (
                  <RefreshCw size={15} />
                ) : (
                  <Cloud size={15} />
                )
              }
              onClick={() => onOpen(kind)}
            >
              {t(`assistantGuidance.${kind}`)}
            </Button>
          </Tooltip>
        ),
      )}
    </>
  );
}
