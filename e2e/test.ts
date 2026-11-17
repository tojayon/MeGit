import { test as base, expect } from '@playwright/test';

// Reset the test server through its API; its workspace store is cached in memory.
export const test = base.extend<{ isolatedWorkspace: void }>({
  isolatedWorkspace: [
    async ({ request }, use) => {
      const session = await request.get('/api/session');
      const { token } = await session.json();
      const headers = { 'X-MeGit-Token': token };
      const workspace = await (await request.get('/api/workspace', { headers })).json();
      const id = 'test-workflow';
      const response = await request.put('/api/workspace', {
        headers,
        data: {
          ...workspace,
          activeBoardId: id,
          repositories: [],
          boards: [{ id, name: '开发流程', description: '', nodes: [], edges: [] }],
        },
      });
      expect(response.ok()).toBe(true);
      await use();
    },
    { auto: true },
  ],
});
export { expect };
