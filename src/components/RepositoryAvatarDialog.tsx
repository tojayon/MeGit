import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Folder,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import type { Repository, RepositoryImage, RepositoryImages } from '../../shared/types';
import { api, request } from '../lib/api';
import { loadRepositoryImage } from '../lib/repository-images';
import { formatError } from '../lib/messages';
import { Dialog } from './Dialogs';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { RepositoryAvatar } from './RepositoryAvatar';

export function RepositoryAvatarDialog({
  repo,
  onClose,
  onSave,
  disabled = false,
}: {
  repo: Repository;
  onClose: () => void;
  onSave: (path?: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [directory, setDirectory] = useState(
    repo.logoPath?.split('/').slice(0, -1).join('/') || '',
  );
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(repo.logoPath || '');
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [listing, setListing] = useState<{
    key: string;
    data?: RepositoryImages;
    error?: unknown;
  }>();
  const [preview, setPreview] = useState<{
    key: string;
    data?: RepositoryImage;
    error?: unknown;
  }>();
  const [decoded, setDecoded] = useState<string>();
  const [decodeError, setDecodeError] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<unknown>();
  const listKey = JSON.stringify([repo.id, directory, offset]);
  const selectionKey = JSON.stringify([selected, selectionVersion]);
  const { id, path: root } = repo;
  useEffect(() => {
    let active = true;
    void api.repositoryImages(id, directory, offset).then(
      (data) => {
        if (active) setListing({ key: listKey, data });
      },
      (error: unknown) => {
        if (active) setListing({ key: listKey, error });
      },
    );
    return () => {
      active = false;
    };
  }, [id, directory, offset, listKey]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    void loadRepositoryImage(id, root, selected, true).then(
      (data) => {
        if (active) setPreview({ key: selectionKey, data });
      },
      (error: unknown) => {
        if (active) setPreview({ key: selectionKey, error });
      },
    );
    return () => {
      active = false;
    };
  }, [id, root, selected, selectionKey]);
  const data = listing?.key === listKey ? listing.data : undefined;
  const listError = listing?.key === listKey ? listing.error : undefined;
  const image = preview?.key === selectionKey ? preview.data : undefined;
  const imageError = preview?.key === selectionKey ? preview.error : undefined;
  const invalidImage = !!selected && decodeError === selectionKey;
  const ready = !selected || (!!image && decoded === selectionKey && !invalidImage);
  function navigate(next: string) {
    setDirectory(next);
    setOffset(0);
  }
  function choose(next: string) {
    setSelected(next);
    setSelectionVersion((value) => value + 1);
  }
  return (
    <Dialog
      title={t('repositoryAvatar.title')}
      onClose={onClose}
      busy={picking}
      className="repository-avatar-dialog"
    >
      <div className="dialog-body repository-avatar-body">
        <div className="repository-avatar-selection">
          <div className="repository-avatar-preview">
            {selected && image ? (
              <img
                key={selectionKey}
                src={image.dataUrl}
                alt={t('repositoryAvatar.preview', { name: repo.name })}
                onLoad={() => setDecoded(selectionKey)}
                onError={() => setDecodeError(selectionKey)}
              />
            ) : (
              <RepositoryAvatar repo={{ ...repo, logoPath: undefined }} size="preview" />
            )}
          </div>
          <div className="repository-avatar-selection-text">
            <strong>{repo.name}</strong>
            <span>{selected || t('repositoryAvatar.default')}</span>
            <Button
              size="compact"
              icon={<RotateCcw size={14} />}
              onClick={() => choose('')}
              disabled={!selected}
            >
              {t('repositoryAvatar.reset')}
            </Button>
          </div>
        </div>
        <p className="muted repository-avatar-help">{t('repositoryAvatar.help')}</p>
        <Button
          busy={picking}
          disabled={disabled}
          onClick={async () => {
            setPicking(true);
            setPickerError(undefined);
            try {
              const result = await request<{ path: string | null }>(
                `/repositories/${encodeURIComponent(id)}/pick-image`,
                { method: 'POST' },
              );
              if (result.path) choose(result.path);
            } catch (failure) {
              setPickerError(failure);
            } finally {
              setPicking(false);
            }
          }}
        >
          {t('repositoryIndex.pickAvatar')}
        </Button>
        {Boolean(pickerError) && (
          <p role="alert" className="field-error">
            {formatError(pickerError)}
          </p>
        )}
        {(imageError || invalidImage) && (
          <p className="field-error" role="alert">
            {imageError ? formatError(imageError) : t('repositoryAvatar.decodeError')}
          </p>
        )}
        {selected && !image && !imageError && (
          <p role="status" className="muted">
            {t('common.loading')}
          </p>
        )}
        <nav className="repository-avatar-navigation" aria-label={t('repositoryAvatar.browse')}>
          <IconButton
            label={t('repositoryAvatar.parent')}
            disabled={!directory}
            onClick={() => navigate(directory.split('/').slice(0, -1).join('/'))}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <Button size="compact" onClick={() => navigate('')} disabled={!directory}>
            {t('repositoryAvatar.root')}
          </Button>
          <code>{directory || '/'}</code>
        </nav>
        <div className="repository-avatar-files" aria-busy={(!data && !listError) || undefined}>
          {listError ? (
            <p className="field-error" role="alert">
              {formatError(listError)}
            </p>
          ) : !data ? (
            <div className="loading-region" role="status">
              <LoaderCircle className="spin" size={20} />
              {t('common.loading')}
            </div>
          ) : data.entries.length ? (
            <ul aria-label={t('repositoryAvatar.browse')}>
              {data.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="repository-avatar-file"
                    aria-label={t(
                      entry.kind === 'directory'
                        ? 'repositoryAvatar.openDirectory'
                        : 'repositoryAvatar.selectImage',
                      { name: entry.name },
                    )}
                    aria-pressed={entry.kind === 'image' ? selected === entry.path : undefined}
                    onClick={() =>
                      entry.kind === 'directory' ? navigate(entry.path) : choose(entry.path)
                    }
                  >
                    {entry.kind === 'directory' ? <Folder size={18} /> : <FileImage size={18} />}
                    <span>{entry.name}</span>
                    {entry.kind === 'directory' && <ChevronRight size={16} />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('repositoryAvatar.empty')}</p>
          )}
        </div>
        {(offset > 0 || data?.hasMore) && (
          <div className="repository-avatar-pagination">
            <Button
              size="compact"
              icon={<ChevronLeft size={15} />}
              disabled={!offset || !data}
              onClick={() => setOffset((value) => Math.max(0, value - 100))}
            >
              {t('repositoryAvatar.previous')}
            </Button>
            <Button
              size="compact"
              icon={<ChevronRight size={15} />}
              disabled={!data?.hasMore}
              onClick={() => setOffset((value) => value + 100)}
            >
              {t('repositoryAvatar.next')}
            </Button>
          </div>
        )}
      </div>
      <footer className="dialog-footer">
        <Button disabled={picking} onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={disabled || picking || !ready}
          onClick={() => {
            onSave(selected || undefined);
            onClose();
          }}
        >
          {t('repositoryAvatar.apply')}
        </Button>
      </footer>
    </Dialog>
  );
}
