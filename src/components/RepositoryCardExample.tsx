import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitAction, RepoState } from '../../shared/types';
import type { LocalServiceCardState } from '../../shared/local-service';
import { RepositoryCard } from './RepositoryCard';
import { LocalServiceCardControls } from './LocalServiceCardControls';
import { RepositoryShortcutControl } from './RepositoryShortcutControl';
import { Dialog } from './Dialogs';
import { Button } from './Button';
import { Field } from './Field';
import { WorktreeIdentity } from './RepositoryPanel';
import { CommitComposer } from './CommitComposer';

export function RepositoryCardExample() {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [staged, setStaged] = useState(false);
  const [changed, setChanged] = useState(true);
  const [showWorktree, setShowWorktree] = useState(false);
  const [version, setVersion] = useState('1.2.3');
  const [versionDraft, setVersionDraft] = useState<string | null>(null);
  const repo = { id: 'card-example', name: 'MeGit / repository-with-a-long-name', path: '' };
  const [service, setService] = useState<LocalServiceCardState>({
    repoId: 'card-example',
    revision: 'preview',
    status: 'stopped',
  });
  const state: RepoState = {
    branch: 'feature/repository-card-layout',
    head: 'a'.repeat(40),
    detached: false,
    upstream: null,
    ahead: null,
    behind: null,
    changed: changed ? 1 : 0,
    staged: staged ? 1 : 0,
    files: changed
      ? [
          {
            path: 'feature.ts',
            indexStatus: staged ? 'M' : '.',
            worktreeStatus: staged ? '.' : 'M',
            untracked: false,
            conflicted: false,
          },
        ]
      : [],
    branches: [],
    remotes: [],
    fetchedAt: null,
    checkedAt: '',
  };
  async function runAction(action: GitAction) {
    if (action.type === 'stage') setStaged(true);
    if (action.type === 'unstage') setStaged(false);
    if (action.type === 'commit') {
      setChanged(false);
      setStaged(false);
      setMessage('');
    }
    return true;
  }
  async function generateMessage() {
    setMessage(t('repositoryCard.aiExample'));
    return true;
  }
  return (
    <section className="design-card" aria-label={t('repositoryCard.example')}>
      <h2>{t('repositoryCard.example')}</h2>
      <RepositoryCard
        repo={repo}
        state={state}
        message={message}
        onMessage={setMessage}
        busy=""
        onWorktree={() => setShowWorktree(true)}
        serviceControls={
          <LocalServiceCardControls
            service={service}
            onAction={async (action) =>
              setService({
                ...service,
                status: action === 'stop' ? 'stopped' : 'running',
                runningSince: action === 'stop' ? undefined : Date.now(),
              })
            }
          />
        }
        onGenerate={generateMessage}
        onOpen={() => {}}
        onAction={runAction}
      />
      {showWorktree && (
        <Dialog
          title={t('repository.worktree')}
          headerLeading={<WorktreeIdentity repo={repo} state={state} />}
          className="repository-tools-dialog worktree-detail-dialog"
          wide
          onClose={() => setShowWorktree(false)}
        >
          <div className="dialog-body">
            <RepositoryShortcutControl
              shortcut={{ target: { kind: 'npm' } }}
              field={{ value: version }}
              onOpen={() => setVersionDraft(version)}
            />
            <CommitComposer
              state={state}
              message={message}
              onMessage={setMessage}
              busy=""
              onAction={runAction}
              onGenerate={generateMessage}
            >
              <div className="worktree-file-panes" />
            </CommitComposer>
          </div>
        </Dialog>
      )}
      {versionDraft !== null && (
        <Dialog title={t('repositoryFiles.version')} onClose={() => setVersionDraft(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setVersion(versionDraft);
              setVersionDraft(null);
            }}
          >
            <div className="dialog-body">
              <Field label={t('repositoryFiles.value')}>
                <input
                  required
                  value={versionDraft}
                  onChange={(event) => setVersionDraft(event.target.value)}
                />
              </Field>
            </div>
            <footer className="dialog-footer">
              <Button onClick={() => setVersionDraft(null)}>{t('common.cancel')}</Button>
              <Button type="submit" variant="primary">
                {t('common.save')}
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </section>
  );
}
