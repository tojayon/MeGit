import { useMemo } from 'react';
import { ChevronRight, FileCode2, Folder } from 'lucide-react';

type Entry = { name: string; path: string; children?: Map<string, Entry> };

function buildTree(files: string[]) {
  const root = new Map<string, Entry>();
  for (const file of files) {
    const parts = file.split('/');
    let entries = root;
    parts.forEach((name, index) => {
      const directory = index < parts.length - 1;
      let entry = entries.get(name);
      if (!entry) {
        entry = {
          name,
          path: parts.slice(0, index + 1).join('/'),
          children: directory ? new Map() : undefined,
        };
        entries.set(name, entry);
      }
      if (entry.children) entries = entry.children;
    });
  }
  return root;
}

function TreeEntries({
  entries,
  selected,
  busy,
  onOpen,
}: {
  entries: Map<string, Entry>;
  selected?: string;
  busy: boolean;
  onOpen: (path: string) => void;
}) {
  const sorted = [...entries.values()].sort(
    (first, second) =>
      Number(!!second.children) - Number(!!first.children) || first.name.localeCompare(second.name),
  );
  return (
    <ul className="repository-file-entries">
      {sorted.map(({ name, path, children }) => (
        <li key={path}>
          {children ? (
            <details>
              <summary className="repository-file-row" title={path}>
                <ChevronRight size={14} className="repository-file-chevron" aria-hidden="true" />
                <Folder size={15} aria-hidden="true" />
                <span>{name}</span>
              </summary>
              <TreeEntries entries={children} selected={selected} busy={busy} onOpen={onOpen} />
            </details>
          ) : (
            <button
              type="button"
              className="repository-file-row repository-file-item"
              aria-current={selected === path ? 'true' : undefined}
              title={path}
              disabled={busy}
              onClick={() => onOpen(path)}
            >
              <FileCode2 size={15} aria-hidden="true" />
              <span>{name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RepositoryFileTree({
  files,
  selected,
  busy,
  onOpen,
}: {
  files: string[];
  selected?: string;
  busy: boolean;
  onOpen: (path: string) => void;
}) {
  const entries = useMemo(() => buildTree(files), [files]);
  return <TreeEntries entries={entries} selected={selected} busy={busy} onOpen={onOpen} />;
}
