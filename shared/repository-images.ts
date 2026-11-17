export const repositoryImageExtensions = [
  'svg',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'ico',
] as const;
export const repositoryImageLimit = 1024 * 1024;

export function isRepositoryAssetPath(value: string, allowRoot = false) {
  if (value === '') return allowRoot;
  return (
    value.length <= 4000 &&
    value
      .split('/')
      .every(
        (part) =>
          part.length > 0 &&
          part !== '.' &&
          part !== '..' &&
          part.toLowerCase() !== '.git' &&
          !/[<>:"|?*\\]/.test(part) &&
          [...part].every((character) => character.charCodeAt(0) >= 32) &&
          !/[. ]$/.test(part),
      )
  );
}

export function isRepositoryImagePath(value: string) {
  return (
    isRepositoryAssetPath(value) &&
    repositoryImageExtensions.some((extension) => value.toLowerCase().endsWith(`.${extension}`))
  );
}
