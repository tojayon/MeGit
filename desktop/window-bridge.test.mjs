import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const bridge = readFileSync(new URL('src-tauri/src/window_bridge.js', import.meta.url), 'utf8');

test('the window bridge is only injected on the owned top-level origin', async () => {
  const origin = 'http://127.0.0.1:43217';
  for (const [actualOrigin, isTop, expected] of [
    [origin, true, true],
    [origin, false, false],
    ['http://127.0.0.1:4317', true, false],
    ['https://example.invalid', true, false],
  ]) {
    const window = {
      __TAURI_INTERNALS__: { invoke: async (command, args) => [command, args.request] },
    };
    window.top = isTop ? window : {};
    runInNewContext(bridge, { window, location: { origin: actualOrigin } });
    if (expected) {
      const request = { action: 'read' };
      assert.deepEqual(await window.megitDesktop(request), ['desktop_window', request]);
    } else {
      assert.equal(window.megitDesktop, undefined);
    }
  }
});
