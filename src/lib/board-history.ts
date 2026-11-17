import type { Board, Workspace } from '../../shared/types';

type Content = Pick<Board, 'name' | 'description' | 'nodes' | 'edges' | 'groups' | 'notes'>;
const content = ({ name, description, nodes, edges, groups, notes }: Board): Content =>
  structuredClone({ name, description, nodes, edges, groups, notes });

// Only board content is replayed. Revision, repository registrations and Git state stay live.
export class BoardHistory {
  private entries = new Map<string, { past: Content[]; future: Content[] }>();

  record(before: Workspace, after: Workspace) {
    for (const board of after.boards) {
      const previous = before.boards.find((b) => b.id === board.id);
      if (!previous || JSON.stringify(content(previous)) === JSON.stringify(content(board)))
        continue;
      const entry = this.entries.get(board.id) || { past: [], future: [] };
      entry.past.push(content(previous));
      if (entry.past.length > 50) entry.past.shift();
      entry.future = [];
      this.entries.set(board.id, entry);
    }
    for (const id of this.entries.keys())
      if (!after.boards.some((b) => b.id === id)) this.entries.delete(id);
  }

  canUndo(id: string) {
    return !!this.entries.get(id)?.past.length;
  }
  canRedo(id: string) {
    return !!this.entries.get(id)?.future.length;
  }

  private restore(workspace: Workspace, id: string, direction: 'past' | 'future') {
    const entry = this.entries.get(id);
    const board = workspace.boards.find((b) => b.id === id);
    if (!entry || !board || !entry[direction].length) return null;
    const next = structuredClone(workspace);
    const target = next.boards.find((b) => b.id === id)!;
    entry[direction === 'past' ? 'future' : 'past'].push(content(board));
    Object.assign(target, entry[direction].pop()!);
    return next;
  }

  undo(workspace: Workspace, id: string) {
    return this.restore(workspace, id, 'past');
  }
  redo(workspace: Workspace, id: string) {
    return this.restore(workspace, id, 'future');
  }
}
