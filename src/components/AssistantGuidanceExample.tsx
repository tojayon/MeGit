import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RepoState } from '../../shared/types';
import { defaultAssistantGuides, type AssistantGuideKind } from '../../shared/assistant-guidance';
import { AssistantGuideButtons } from './AssistantGuidance';
import { RemoteActionDialog } from './RemoteActionDialog';
import { Button } from './Button';
import { Dialog } from './Dialogs';
import { GitHelp } from './GitHelp';
import { actionArguments } from '../../shared/git-commands';

export function AssistantGuidanceExample() {
  const { t } = useTranslation();
  const [view, setView] = useState<AssistantGuideKind | null>(null);
  const [state, setState] = useState<RepoState>({
    branch: 'main',
    head: 'a'.repeat(40),
    detached: false,
    upstream: null,
    ahead: null,
    behind: null,
    changed: 0,
    staged: 0,
    files: [],
    branches: [],
    remotes: [],
    checkedAt: '',
    fetchedAt: null,
  });
  return (
    <section className="design-card">
      <h2>{t('assistantGuidance.title')}</h2>
      <div className="assistant-guidance">
        <strong>MeGit</strong>
        <div className="assistant-guidance-actions">
          <AssistantGuideButtons
            kinds={defaultAssistantGuides(state)}
            state={state}
            onOpen={setView}
          />
          <AssistantGuideButtons
            kinds={['worktree', 'branches', 'remotes']}
            state={state}
            disabled
            onOpen={setView}
          />
          {!!state.remotes.length && <span role="status">{t('assistantGuidance.updated')}</span>}
          <Button
            size="compact"
            onClick={() =>
              setState((saved) => ({
                ...saved,
                remotes: [],
                branches: [],
                upstream: null,
                upstreamHead: null,
                trackingConfigured: false,
              }))
            }
          >
            {t('designSystem.restoreExample')}
          </Button>
        </div>
      </div>
      {(view === 'addRemote' || view === 'publishBranch' || view === 'setTracking') && (
        <RemoteActionDialog
          type={view}
          state={state}
          busy={false}
          onClose={() => setView(null)}
          onAction={async (action) => {
            setState((saved) => ({
              ...saved,
              remotes: action.type === 'addRemote' ? [action.name] : saved.remotes,
              ...(action.type === 'publishBranch'
                ? {
                    branches: [
                      ...saved.branches,
                      {
                        name: `${action.remote}/${action.name}`,
                        hash: saved.head!,
                        current: false,
                        remote: true,
                      },
                    ],
                  }
                : {}),
              ...(action.type === 'setTracking'
                ? {
                    upstream: action.targetRef.slice('refs/remotes/'.length),
                    upstreamHead: action.targetHash,
                    trackingConfigured: true,
                  }
                : {}),
            }));
            return true;
          }}
        />
      )}
      {view === 'fetch' && (
        <Dialog title={t('assistantGuidance.fetch')} onClose={() => setView(null)}>
          <div className="dialog-body">
            <GitHelp
              topic="fetch"
              preview={{ when: 'confirm', commands: [actionArguments({ type: 'fetch' }, state)] }}
            />
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setView(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setState((saved) => ({
                  ...saved,
                  fetchedAt: new Date().toISOString(),
                  branches: [
                    {
                      name: `${saved.remotes[0]}/main`,
                      current: false,
                      remote: true,
                      hash: saved.head!,
                    },
                  ],
                }));
                setView(null);
              }}
            >
              {t('repository.fetch')}
            </Button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
