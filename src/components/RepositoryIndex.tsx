import { useState } from 'react';
import { ArrowUpRight, Archive, FolderGit2, Pencil, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Repository } from '../../shared/types';
import { AddRepositoryDialog, Dialog } from './Dialogs';
import { RepositoryAvatar } from './RepositoryAvatar';
import { IconButton } from './IconButton';
import { Button } from './Button';
import { Field } from './Field';
import { useViewState } from '../lib/use-view-state';
import { isBoolean } from '../lib/view-storage';

export function RepositoryIndex({
  repositories,
  used,
  readOnly,
  canAddToBoard,
  onClose,
  onRegister,
  onEdit,
  onRemove,
  onOpen,
}: {
  repositories: Repository[];
  used: ReadonlySet<string>;
  readOnly: boolean;
  canAddToBoard: boolean;
  onClose: () => void;
  onRegister: (repo: Repository) => void;
  onEdit: (repo: Repository) => void;
  onRemove: (id: string) => void;
  onOpen: (repo: Repository) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [archived, setArchived] = useViewState('app.repositories.archived', false, isBoolean);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const [adding, setAdding] = useState(false);
  const target = repositories.find((repo) => repo.id === editing);
  const visible = repositories.filter((repo) => Boolean(repo.archived) === archived);
  return (
    <Dialog
      wide
      className="repository-index"
      viewKey="app.repositories"
      title={t('nav.repositories')}
      onClose={onClose}
      headerActions={
        <Button
          variant="primary"
          size="compact"
          icon={<Plus size={16} />}
          disabled={readOnly}
          onClick={() => setAdding(true)}
        >
          {t('repositoryIndex.register')}
        </Button>
      }
    >
      <div className="repository-index-layout">
        <nav className="settings-navigation repository-index-navigation" aria-label={t('nav.repositories')}>
          <button type="button" aria-current={!archived} onClick={() => setArchived(false)}>
            <FolderGit2 size={16} aria-hidden="true" />
            {t('repositoryIndex.active')}
          </button>
          <button type="button" aria-current={archived} onClick={() => setArchived(true)}>
            <Archive size={16} aria-hidden="true" />
            {t('repositoryIndex.archived')}
          </button>
        </nav>
        <div className="repository-index-content">
        {visible.length ? (
          <div className="repository-index-grid">
            {visible.map((repo) => (
              <article key={repo.id} className="repository-index-card">
                <div className="repository-index-identity">
                  <RepositoryAvatar repo={repo} size="large" />
                  <div className="repository-index-text">
                    <div className="repository-index-title">
                      <h3>{repo.name}</h3>
                      {!archived && (
                        <IconButton
                          className="repository-index-board-action"
                          size="small"
                          label={t(used.has(repo.id) ? 'repositoryIndex.open' : 'repository.addToBoard')}
                          disabled={readOnly || (!used.has(repo.id) && !canAddToBoard)}
                          onClick={() => onOpen(repo)}
                        >
                          {used.has(repo.id) ? <ArrowUpRight size={16} /> : <Plus size={16} />}
                        </IconButton>
                      )}
                    </div>
                    <p>{repo.path}</p>
                  </div>
                </div>
                <div className="repository-index-actions">
                  <IconButton
                    label={t('repositoryIndex.edit', { name: repo.name })}
                    disabled={readOnly}
                    onClick={() => setEditing(repo.id)}
                  >
                    <Pencil size={16} />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <Search size={25} />
            <p>{t(archived ? 'repositoryIndex.archiveEmpty' : 'board.indexEmpty')}</p>
          </div>
        )}
        </div>
      </div>
      {adding && (
        <AddRepositoryDialog
          mode="register"
          existing={repositories}
          onAdd={onRegister}
          onClose={() => setAdding(false)}
        />
      )}
      {target && (
        <AddRepositoryDialog
          mode="edit"
          repo={target}
          existing={[]}
          onAdd={onEdit}
          onArchive={() => {
            onEdit({ ...target, archived: !target.archived });
            setEditing(null);
          }}
          onRemove={() => {
            setConfirmation('');
            setConsent(false);
            setConfirming(true);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {target && confirming && (
        <Dialog title={t('repositoryIndex.remove')} onClose={() => setConfirming(false)}>
          <div className="dialog-body">
            <p>{t('repositoryIndex.removeHelp', { name: target.name })}</p>
            <Field label={t('repositoryIndex.typeName')}>
              <input
                autoFocus
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />{' '}
              {t('repositoryIndex.consent')}
            </label>
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={readOnly || !consent || confirmation !== target.name}
              onClick={() => {
                onRemove(target.id);
                setConfirming(false);
                setEditing(null);
              }}
            >
              {t('repositoryIndex.remove')}
            </Button>
          </footer>
        </Dialog>
      )}
    </Dialog>
  );
}
