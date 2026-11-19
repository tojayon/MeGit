import { expect, it, vi } from 'vitest';
import { completeAi, normalizeAiEndpoint } from '../server/ai';
import { aiDiagramSchema } from '../shared/ai';

it.each(['https://provider.example/', 'https://provider.example//chat/completions'])(
  'normalizes the root endpoint %s without creating a duplicate slash',
  (endpoint) => {
    expect(normalizeAiEndpoint(endpoint)).toBe('https://provider.example/chat/completions');
  },
);

it('rejects unencrypted remote endpoints', () => {
  expect(() => normalizeAiEndpoint('http://provider.example')).toThrow();
  expect(() => normalizeAiEndpoint('https://user:key@provider.example')).toThrow();
  expect(normalizeAiEndpoint('http://127.0.0.1:1234/v1/')).toBe(
    'http://127.0.0.1:1234/v1/chat/completions',
  );
});

it('never follows redirects or exposes upstream diagnostics', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('secret', { status: 302 }));
  await expect(
    completeAi(
      { endpoint: 'https://provider.example', model: 'demo', apiKey: 'secret' },
      [],
      transport,
    ),
  ).rejects.toMatchObject({ code: 'aiUnavailable', details: undefined });
  expect(transport.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
});

it('rejects invalid diagram endpoints and duplicate connections', () => {
  const nodes = [
    { title: 'Start', kind: 'start' },
    { title: 'End', kind: 'end' },
  ];
  const edge = { source: 0, target: 1, label: '' };
  expect(aiDiagramSchema.safeParse({ nodes, edges: [edge] }).success).toBe(true);
  expect(aiDiagramSchema.safeParse({ nodes, edges: [edge, edge] }).success).toBe(false);
  expect(aiDiagramSchema.safeParse({ nodes, edges: [{ ...edge, target: 2 }] }).success).toBe(false);
});

it('propagates caller cancellation to the AI transport', async () => {
  const controller = new AbortController();
  const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    expect(options?.signal?.aborted).toBe(true);
    throw new DOMException('Aborted', 'AbortError');
  });
  controller.abort();
  await expect(
    completeAi(
      { endpoint: 'https://provider.example', model: 'demo', apiKey: '' },
      [],
      transport,
      controller.signal,
    ),
  ).rejects.toMatchObject({ code: 'aiUnavailable' });
  expect(transport).toHaveBeenCalledOnce();
});
