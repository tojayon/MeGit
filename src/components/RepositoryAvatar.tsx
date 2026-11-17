import { useEffect, useState } from 'react';
import { FolderGit2 } from 'lucide-react';
import type { Repository } from '../../shared/types';
import { loadRepositoryImage } from '../lib/repository-images';

export function RepositoryAvatar({
  repo,
  size = 'default',
  image,
}: {
  repo: Repository;
  size?: 'small' | 'default' | 'large' | 'preview';
  image?: string;
}) {
  const { id, path: root, logoPath } = repo;
  const key = JSON.stringify([id, root, logoPath]);
  const [loaded, setLoaded] = useState<{ key: string; source?: string; failed?: boolean }>();
  const [failedImage, setFailedImage] = useState<string>();
  useEffect(() => {
    if (!logoPath || image) return;
    let active = true;
    void loadRepositoryImage(id, root, logoPath).then(
      (value) => {
        if (active) setLoaded({ key, source: value.dataUrl });
      },
      () => {
        if (active) setLoaded({ key, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [id, root, logoPath, key, image]);
  const source = image || (loaded?.key === key ? loaded.source : undefined);
  const failed = (!!source && source === failedImage) || (loaded?.key === key && loaded.failed);
  return (
    <span
      className={`repository-avatar repository-avatar-size-${size}`}
      data-repository-id={id}
      data-logo-state={failed ? 'error' : source ? 'ready' : logoPath ? 'loading' : 'default'}
      aria-hidden="true"
    >
      {source && !failed ? (
        <img src={source} alt="" draggable={false} onError={() => setFailedImage(source)} />
      ) : (
        <FolderGit2 />
      )}
    </span>
  );
}
