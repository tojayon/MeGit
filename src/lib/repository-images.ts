import type { Repository, RepositoryImage } from '../../shared/types';
import { api } from './api';

const images = new Map<string, Promise<RepositoryImage>>();

export function loadRepositoryImage(repoId: string, root: string, path: string, fresh = false) {
  const key = JSON.stringify([repoId, root, path]);
  if (fresh) images.delete(key);
  let image = images.get(key);
  if (!image) {
    image = api.repositoryImage(repoId, path).catch((error) => {
      if (images.get(key) === image) images.delete(key);
      throw error;
    });
    images.set(key, image);
    if (images.size > 64) images.delete(images.keys().next().value!);
  }
  return image;
}

export async function repositoryImage(repo: Repository) {
  return repo.logoPath
    ? (await loadRepositoryImage(repo.id, repo.path, repo.logoPath)).dataUrl
    : undefined;
}
