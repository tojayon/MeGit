import { z } from 'zod';

export interface AiSettings {
  endpoint: string;
  model: string;
  hasApiKey: boolean;
  projectDelivery?: boolean;
  projectRevision?: string;
}

export const aiDiagramSchema = z
  .strictObject({
    nodes: z
      .array(
        z.strictObject({
          title: z.string().trim().min(1).max(80),
          kind: z.enum(['start', 'process', 'decision', 'end']),
        }),
      )
      .min(1)
      .max(12),
    edges: z
      .array(
        z.strictObject({
          source: z.number().int().min(0),
          target: z.number().int().min(0),
          label: z.string().max(80),
        }),
      )
      .max(24),
  })
  .refine(
    ({ nodes, edges }) =>
      new Set(edges.map(({ source, target, label }) => `${source}:${target}:${label}`)).size ===
        edges.length &&
      edges.every(
        ({ source, target }) => source < nodes.length && target < nodes.length && source !== target,
      ),
  );

export type AiDiagram = z.infer<typeof aiDiagramSchema>;
