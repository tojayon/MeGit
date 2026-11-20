import { z } from 'zod';
import type { Board } from './types.js';

const id = z.string().min(1).max(100);
const point = z.strictObject({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});
const fields = {
  title: z.string().trim().min(1).max(100),
  text: z.string().max(2000),
  kind: z.enum(['note', 'process', 'decision', 'start', 'end']),
  summary: z.string().max(200),
};
export const boardOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('addStep'), id, ...fields, position: point }),
  z.strictObject({
    type: z.literal('updateStep'),
    id,
    title: fields.title.optional(),
    text: fields.text.optional(),
    kind: fields.kind.optional(),
    summary: fields.summary.optional(),
  }),
  z.strictObject({ type: z.literal('removeStep'), id }),
  z.strictObject({
    type: z.literal('connect'),
    id,
    source: id,
    target: id,
    label: z.string().max(100),
  }),
  z.strictObject({
    type: z.literal('updateConnection'),
    id,
    source: id.optional(),
    target: id.optional(),
    label: z.string().max(100).optional(),
  }),
  z.strictObject({ type: z.literal('removeConnection'), id }),
  z.strictObject({ type: z.literal('moveElement'), id, position: point }),
  z.strictObject({ type: z.literal('arrange'), direction: z.enum(['vertical', 'horizontal']) }),
  z.strictObject({
    type: z.literal('updateBoard'),
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }),
]);
export type BoardOperation = z.infer<typeof boardOperationSchema>;
export const boardPlanSchema = z.strictObject({
  id,
  boardId: id,
  boardName: z.string().max(100),
  baseline: z.string().max(40),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  operations: z.array(boardOperationSchema).min(1).max(40),
});
export type AssistantBoardPlan = z.infer<typeof boardPlanSchema>;

// Content freshness marker, not an authorization token. Viewport movement does not invalidate edits.
export function boardSignature(board: Board): string {
  const content = { ...board };
  delete content.viewport;
  const text = JSON.stringify(content, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')))
      : value,
  );
  let a = 2166136261,
    b = 3335557771;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822507);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function applyBoardOperations(board: Board, input: BoardOperation[]): Board {
  if (board.layoutLocked) throw new Error('assistantBoardLocked');
  const parsed = z.array(boardOperationSchema).min(1).max(40).safeParse(input);
  if (!parsed.success) throw new Error('assistantBoardInvalid');
  const next = structuredClone(board);
  const fail = (): never => {
    throw new Error('assistantBoardInvalid');
  };
  const unique = (id: string) =>
    ![
      ...next.nodes,
      ...(next.notes || []),
      ...next.edges,
      ...(next.connections || []),
      ...(next.groups || []),
    ].some((item) => item.id === id);
  for (const operation of parsed.data) {
    const { type, ...data } = operation;
    if (type === 'addStep') {
      if (!unique(operation.id)) fail();
      (next.notes ??= []).push({
        id: operation.id,
        title: operation.title,
        text: operation.text,
        kind: operation.kind,
        summary: operation.summary,
        position: operation.position,
      });
    } else if (operation.type === 'updateStep') {
      const note = next.notes?.find((item) => item.id === operation.id);
      if (!note) fail();
      Object.assign(note!, data);
    } else if (operation.type === 'removeStep') {
      if (!next.notes?.some((item) => item.id === operation.id)) fail();
      next.notes = next.notes!.filter((item) => item.id !== operation.id);
      next.connections = (next.connections || []).filter(
        (item) => item.source !== operation.id && item.target !== operation.id,
      );
    } else if (operation.type === 'connect') {
      if (!unique(operation.id)) fail();
      (next.connections ??= []).push({
        id: operation.id,
        source: operation.source,
        target: operation.target,
        label: operation.label,
      });
    } else if (operation.type === 'updateConnection') {
      const edge = next.connections?.find((item) => item.id === operation.id);
      if (!edge) fail();
      Object.assign(edge!, data);
      delete edge!.waypoints;
    } else if (operation.type === 'removeConnection') {
      if (!next.connections?.some((item) => item.id === operation.id)) fail();
      next.connections = next.connections!.filter((item) => item.id !== operation.id);
    } else if (operation.type === 'moveElement') {
      const element = [...next.nodes, ...(next.notes || [])].find(
        (item) => item.id === operation.id,
      );
      if (!element) fail();
      element!.position = operation.position;
      for (const edge of [...next.edges, ...(next.connections || [])])
        if (edge.source === operation.id || edge.target === operation.id) delete edge.waypoints;
    } else if (operation.type === 'arrange') {
      // Keep independent branches side by side; break cycles in stable input order.
      const elements = [...next.nodes, ...(next.notes || [])];
      const members = new Set((next.groups || []).flatMap((group) => group.nodeIds));
      const units = [
        ...(next.groups || []).map((group) => {
          const nodes = next.nodes.filter((node) => group.nodeIds.includes(node.id));
          const x = Math.min(...nodes.map((node) => node.position.x)) - 24;
          const y = Math.min(...nodes.map((node) => node.position.y)) - 56;
          return {
            id: group.id,
            nodes,
            x,
            y,
            width: Math.max(324, ...nodes.map((node) => node.position.x + 276 + 24 - x)),
            height: Math.max(180, ...nodes.map((node) => node.position.y + 148 + 24 - y)),
          };
        }),
        ...elements
          .filter((item) => !members.has(item.id))
          .map((item) => ({
            id: item.id,
            nodes: [item],
            ...item.position,
            width: 276,
            height:
              'repoId' in item
                ? 148
                : !item.kind || item.kind === 'note'
                  ? 180
                  : item.kind === 'decision'
                    ? 138
                    : item.kind === 'process'
                      ? 106
                      : 64,
          })),
      ];
      const unitOf = (id: string) =>
        units.find((unit) => unit.nodes.some((item) => item.id === id))?.id || id;
      const links = (next.connections || [])
        .map((edge) => ({ source: unitOf(edge.source), target: unitOf(edge.target) }))
        .filter((edge) => edge.source !== edge.target);
      const pending = new Set(units.map((item) => item.id));
      let depth = 80;
      while (pending.size) {
        const ready = units.filter(
          (item) =>
            pending.has(item.id) &&
            !links.some((edge) => edge.target === item.id && pending.has(edge.source)),
        );
        const row = ready.length ? ready : [units.find((item) => pending.has(item.id))!];
        let cross = 80;
        row.forEach((unit) => {
          const x = operation.direction === 'horizontal' ? depth : cross;
          const y = operation.direction === 'vertical' ? depth : cross;
          unit.nodes.forEach((item) => {
            item.position = { x: item.position.x + x - unit.x, y: item.position.y + y - unit.y };
          });
          cross += (operation.direction === 'horizontal' ? unit.height : unit.width) + 64;
        });
        row.forEach((item) => pending.delete(item.id));
        depth +=
          Math.max(
            ...row.map((unit) => (operation.direction === 'horizontal' ? unit.width : unit.height)),
          ) + 64;
      }
      [...next.edges, ...(next.connections || [])].forEach((edge) => {
        delete edge.waypoints;
      });
    } else if (operation.type === 'updateBoard') Object.assign(next, data);
  }
  const endpoints = new Set([...next.nodes, ...(next.notes || [])].map((item) => item.id));
  const connections = next.connections || [];
  if (
    (next.notes?.length || 0) > 200 ||
    connections.length > 600 ||
    [...next.nodes, ...(next.notes || [])].some(
      (item) => Math.abs(item.position.x) > 100000 || Math.abs(item.position.y) > 100000,
    ) ||
    connections.some(
      (edge) =>
        edge.source === edge.target || !endpoints.has(edge.source) || !endpoints.has(edge.target),
    ) ||
    new Set(connections.map((edge) => `${edge.source}:${edge.target}:${edge.label}`)).size !==
      connections.length
  )
    fail();
  if (boardSignature(board) === boardSignature(next)) fail();
  return next;
}
