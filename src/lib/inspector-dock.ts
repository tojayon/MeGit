export type InspectorItem = {
  kind: 'repository' | 'relation';
  id: string;
};
export interface InspectorState {
  boardId: string;
  items: InspectorItem[];
  active: string;
  request: number;
}
export const emptyDock: InspectorState = { boardId: '', items: [], active: '', request: 0 };
export function isInspectorState(value: unknown): value is InspectorState {
  if (!value || typeof value !== 'object') return false;
  const state = value as InspectorState;
  return (
    typeof state.boardId === 'string' &&
    typeof state.active === 'string' &&
    Number.isSafeInteger(state.request) &&
    state.request >= 0 &&
    Array.isArray(state.items) &&
    state.items.length <= 10000 &&
    state.items.every(
      (item) =>
        !!item &&
        ['repository', 'relation'].includes(item.kind) &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        item.id.length <= 1000,
    ) &&
    new Set(state.items.map(inspectorKey)).size === state.items.length
  );
}
export const inspectorKey = (item: InspectorItem) => `${item.kind}:${item.id}`;
export function openInspector(
  state: InspectorState,
  boardId: string,
  item: InspectorItem,
): InspectorState {
  const items = state.boardId === boardId ? state.items : [];
  const key = inspectorKey(item);
  return {
    boardId,
    items: items.some((i) => inspectorKey(i) === key) ? items : [...items, item],
    active: key,
    request: state.request + 1,
  };
}
export function closeInspector(state: InspectorState, key: string): InspectorState {
  const index = state.items.findIndex((i) => inspectorKey(i) === key);
  if (index < 0) return state;
  const items = state.items.filter((i) => inspectorKey(i) !== key);
  return {
    ...state,
    items,
    active:
      state.active === key
        ? items.length
          ? inspectorKey(items[Math.min(index, items.length - 1)])
          : ''
        : state.active,
    request: state.request + (state.active === key ? 1 : 0),
  };
}
export function reconcileInspectors(
  state: InspectorState,
  boardId: string,
  valid: string[],
): InspectorState {
  if (state.boardId !== boardId) return state;
  const keys = new Set(valid);
  return state.items.reduce(
    (next, item) =>
      keys.has(inspectorKey(item)) ? next : closeInspector(next, inspectorKey(item)),
    state,
  );
}
export function dockBounds(windowWidth: number) {
  const max = Math.max(0, Math.floor((windowWidth * 2) / 3));
  return { min: Math.min(320, max), max };
}
