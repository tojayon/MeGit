import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RepoState } from '../../shared/types';
import type { LocalServiceCardState } from '../../shared/local-service';
import { RepositoryCard } from './RepositoryCard';
import { LocalServiceCardControls } from './LocalServiceCardControls';

export function RepositoryCardExample() {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [staged, setStaged] = useState(false);
  const [changed, setChanged] = useState(true);
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
  return (
    <section className="design-card" aria-label={t('repositoryCard.example')}>
      <h2>{t('repositoryCard.example')}</h2>
      <RepositoryCard
        repo={{ id: 'card-example', name: 'MeGit / repository-with-a-long-name', path: '' }}
        state={state}
        message={message}
        onMessage={setMessage}
        busy=""
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
        onGenerate={async () => {
          setMessage(t('repositoryCard.aiExample'));
          return true;
        }}
        onOpen={() => {}}
        onAction={async (action) => {
          if (action.type === 'stage') setStaged(true);
          if (action.type === 'commit') {
            setChanged(false);
            setStaged(false);
            setMessage('');
          }
          return true;
        }}
      />
    </section>
  );
}
