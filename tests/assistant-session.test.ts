import { expect, it } from 'vitest';
import { assistantSessionSchema } from '../src/lib/assistant-session';
import { assistantMessageSchema } from '../src/lib/assistant-session';

it('引导可随回复恢复，只接受有界的导航类型', () => {
  const saved = {
    id: 'm',
    role: 'assistant',
    text: '需要配置远端',
    repositoryIds: ['one'],
    guides: [{ repositoryId: 'one', kind: 'addRemote' }],
  };
  expect(assistantMessageSchema.parse(saved)).toEqual(saved);
  expect(
    assistantMessageSchema.safeParse({
      ...saved,
      guides: [{ repositoryId: 'one', kind: 'execute', command: 'push' }],
    }).success,
  ).toBe(false);
  expect(
    assistantMessageSchema.safeParse({ ...saved, guides: Array(41).fill(saved.guides[0]) }).success,
  ).toBe(false);
});

it('恢复聊天和草稿，不接受动作执行状态或无限历史', () => {
  const saved = {
    conversations: [
      {
        id: 'one',
        title: 'Hello',
        messages: [{ id: 'm', role: 'user', text: 'Hi', repositoryIds: ['repo'] }],
        draft: 'Next',
        repositoryIds: ['repo'],
        includeStagedDiff: false,
      },
    ],
    activeId: 'one',
  };
  expect(assistantSessionSchema.parse(saved)).toEqual(saved);
  expect(assistantSessionSchema.safeParse({ ...saved, executing: true }).success).toBe(false);
  expect(assistantSessionSchema.safeParse({ ...saved, activeId: 'missing' }).success).toBe(false);
  expect(
    assistantSessionSchema.safeParse({
      ...saved,
      conversations: Array(13).fill(saved.conversations[0]),
    }).success,
  ).toBe(false);
});
