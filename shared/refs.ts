/** Passed as individual Git arguments; accepts Unicode branches and common revision expressions. */
export function isSafeRef(ref: string): boolean {
  return (
    ref.length > 0 &&
    ref.length <= 240 &&
    !ref.startsWith('-') &&
    !ref.includes('..') &&
    !ref.includes('@{') &&
    !/[\s\p{Cc}]/u.test(ref) &&
    !['\\', '?', '*', '[', ']', ':'].some((character) => ref.includes(character))
  );
}

/** A literal local branch name, never a revision expression or an option. */
export function isBranchName(name: string): boolean {
  return (
    isSafeRef(name) &&
    !/^HEAD$/i.test(name) &&
    name !== '@' &&
    !/[~^]/.test(name) &&
    !name.endsWith('.') &&
    name.split('/').every((part) => !!part && !part.startsWith('.') && !/\.lock$/i.test(part))
  );
}
