export const VIEW_STATE_KEY = 'megit.view-state';
type Access = () => Pick<Storage, 'getItem' | 'setItem'>;
export type ViewIssue = 'invalid' | 'unavailable' | null;

// Browser-only browsing data; never stores an executable action or repository snapshot.
export function createViewStorage(access: Access) {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const issueListeners = new Set<() => void>();
  let loaded = false;
  let issue: ViewIssue = null;
  const setIssue = (next: ViewIssue) => {
    if (issue === next) return;
    issue = next;
    issueListeners.forEach((fn) => fn());
  };
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = access().getItem(VIEW_STATE_KEY);
      if (!raw) return;
      if (raw.length > 2_000_000) {
        setIssue('invalid');
        return;
      }
      const data = JSON.parse(raw);
      if (
        data?.version !== 1 ||
        !Array.isArray(data.entries) ||
        data.entries.length > 512 ||
        !data.entries.every(
          (entry: unknown) =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === 'string' &&
            entry[0].length <= 4096,
        )
      ) {
        setIssue('invalid');
        return;
      }
      for (const [key, value] of data.entries) values.set(key, value);
    } catch (error) {
      setIssue(error instanceof SyntaxError ? 'invalid' : 'unavailable');
    }
  }
  return {
    read(key: string) {
      load();
      return values.get(key);
    },
    write(key: string, value: unknown) {
      load();
      if (Object.is(values.get(key), value)) return;
      if (value !== undefined && !values.has(key) && values.size >= 512) {
        // Never discard an open component's state to make room for old browsing history.
        const oldest = [...values.keys()].find((entry) => !listeners.get(entry)?.size);
        if (oldest !== undefined) values.delete(oldest);
      }
      if (value === undefined) values.delete(key);
      else values.set(key, value);
      try {
        const raw = JSON.stringify({ version: 1, entries: [...values] });
        if (values.size > 512 || key.length > 4096 || raw.length > 2_000_000)
          throw new Error('view storage full');
        access().setItem(VIEW_STATE_KEY, raw);
      } catch {
        setIssue('unavailable');
      }
      listeners.get(key)?.forEach((fn) => fn());
    },
    subscribe(key: string, callback: () => void) {
      const group = listeners.get(key) ?? new Set();
      listeners.set(key, group);
      group.add(callback);
      return () => {
        group.delete(callback);
        if (!group.size) listeners.delete(key);
      };
    },
    issue() {
      load();
      return issue;
    },
    subscribeIssue(callback: () => void) {
      issueListeners.add(callback);
      return () => {
        issueListeners.delete(callback);
      };
    },
  };
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 10000;
export const isNullableText = (value: unknown): value is string | null =>
  value === null || isText(value);
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 256 && value.every(isText);
export const isScrollPosition = (value: unknown): value is { left: number; top: number } =>
  !!value &&
  typeof value === 'object' &&
  'left' in value &&
  'top' in value &&
  isFiniteNumber(value.left) &&
  isFiniteNumber(value.top) &&
  value.left >= 0 &&
  value.top >= 0 &&
  value.left <= 10_000_000 &&
  value.top <= 10_000_000;
export const viewKey = (...parts: string[]) => JSON.stringify(parts);
