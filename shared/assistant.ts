import { z } from 'zod';
import type { ErrorInfo } from './messages.js';
import { assistantGuideSchema, type AssistantGuide } from './assistant-guidance.js';
import { boardOperationSchema, type AssistantBoardPlan } from './assistant-board.js';
import { projectGrantSchema, type ProjectPlan } from './assistant-project.js';

export const assistantInputSchema = z
  .strictObject({
    prompt: z.string().trim().min(1).max(6000),
    repositoryIds: z
      .array(z.string().min(1).max(128))
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    language: z.enum(['zh-CN', 'en']),
    boardId: z.string().min(1).max(100).optional(),
    projectGrant: projectGrantSchema.optional(),
    includeStagedDiff: z.boolean().default(false),
    planIds: z.array(z.string().max(128)).max(16).optional(),
    history: z
      .array(
        z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string().max(12000) }),
      )
      .max(16)
      .default([]),
  })
  .refine((input) => input.repositoryIds.length > 0 || !!input.boardId || !!input.projectGrant);
export type AssistantInput = z.infer<typeof assistantInputSchema>;
export const assistantOutputSchema = z.strictObject({
  text: z.string().trim().min(1).max(12000),
  guides: z.array(assistantGuideSchema).max(40).default([]),
  boardOperations: z.array(boardOperationSchema).max(40).default([]),
  operations: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({ repositoryId: z.string(), type: z.enum(['fetch', 'stageAll', 'push']) }),
        z.strictObject({
          repositoryId: z.string(),
          type: z.literal('commit'),
          message: z.string().trim().min(1).max(10000),
        }),
      ]),
    )
    .max(40),
});
export type AssistantOperation = z.infer<typeof assistantOutputSchema>['operations'][number];
export const assistantMessagesSchema = z.strictObject({
  messages: z.record(z.string().max(128), z.string().trim().min(1).max(10000)),
});
export interface AssistantStep {
  id: string;
  repositoryId: string;
  repositoryName: string;
  branch: string;
  type: AssistantOperation['type'];
  message?: string;
  target?: string;
  fileCount?: number;
  commands: string[][];
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  error?: ErrorInfo;
}
export interface AssistantPlan {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: 'ready' | 'running' | 'completed' | 'failed' | 'stopped';
  steps: AssistantStep[];
}
export interface AssistantReply {
  text: string;
  guides?: AssistantGuide[];
  plan?: AssistantPlan;
  boardPlan?: AssistantBoardPlan;
  projectPlan?: ProjectPlan;
}
