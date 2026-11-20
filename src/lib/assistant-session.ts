import { z } from 'zod';
import { assistantGuideSchema } from '../../shared/assistant-guidance';
import { boardPlanSchema } from '../../shared/assistant-board';

export const assistantMessageSchema = z.strictObject({
  id: z.string().max(128),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(12000),
  repositoryIds: z.array(z.string().max(128)).max(20),
  planId: z.string().max(128).optional(),
  planMessages: z.record(z.string().max(128), z.string().max(10000)).optional(),
  guides: z.array(assistantGuideSchema).max(40).optional(),
  boardName: z.string().max(100).optional(),
  boardPlan: boardPlanSchema.optional(),
  boardStatus: z.enum(['applied', 'discarded']).optional(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export const assistantConversationSchema = z.strictObject({
  id: z.string().max(128),
  title: z.string().max(100),
  messages: z.array(assistantMessageSchema).max(80),
  draft: z.string().max(6000),
  repositoryIds: z.array(z.string().max(128)).max(20),
  includeStagedDiff: z.boolean(),
  includeBoard: z.boolean().optional(),
});
export const assistantSessionSchema = z
  .strictObject({
    conversations: z.array(assistantConversationSchema).min(1).max(12),
    activeId: z.string().max(128),
  })
  .refine(
    ({ conversations, activeId }) =>
      conversations.some((item) => item.id === activeId) &&
      new Set(conversations.map((item) => item.id)).size === conversations.length,
  );
export type AssistantSession = z.infer<typeof assistantSessionSchema>;
export function newConversation(repositoryIds: string[] = []) {
  return {
    id: crypto.randomUUID(),
    title: '',
    messages: [] as AssistantMessage[],
    draft: '',
    repositoryIds: repositoryIds.slice(0, 20),
    includeStagedDiff: false,
  };
}
export function initialAssistantSession(): AssistantSession {
  const conversation = newConversation();
  return { conversations: [conversation], activeId: conversation.id };
}
export const isAssistantSession = (value: unknown): value is AssistantSession =>
  assistantSessionSchema.safeParse(value).success;
