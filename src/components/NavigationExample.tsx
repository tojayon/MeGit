import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderGit2, Network } from 'lucide-react';
import { NavigationFlyout } from './NavigationFlyout';
import { RepositoryAvatar } from './RepositoryAvatar';

const workflows = ['MeGit / development', 'MeGit / release'];
const repositories = [
  { id: 'core', name: 'MeGit Core', path: '' },
  { id: 'desktop', name: 'MeGit Desktop', path: '' },
];

export function NavigationExample() {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState(workflows[0]);
  const [repository, setRepository] = useState<string | null>(null);
  return (
    <section className="design-card" aria-label={t('nav.flowNav')}>
      <h2>{t('nav.flowNav')}</h2>
      <div className="design-navigation-flyouts">
        <NavigationFlyout label={t('nav.workflows')} icon={<Network size={20} />}>
          <div className="board-list">
            {workflows.map((name) => (
              <button
                type="button"
                className={`board-item ${workflow === name ? 'active' : ''}`}
                key={name}
                aria-current={workflow === name ? true : undefined}
                onClick={() => {
                  setWorkflow(name);
                }}
              >
                <Network size={16} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </NavigationFlyout>
        <NavigationFlyout label={t('nav.onBoard')} icon={<FolderGit2 size={20} />}>
          <>
            {repositories.map((repo) => (
              <button
                type="button"
                className={`outline-repo ${repository === repo.id ? 'selected' : ''}`}
                key={repo.id}
                aria-pressed={repository === repo.id}
                onClick={() => {
                  setRepository(repo.id);
                }}
              >
                <RepositoryAvatar repo={repo} size="small" />
                <span>{repo.name}</span>
              </button>
            ))}
          </>
        </NavigationFlyout>
      </div>
    </section>
  );
}
