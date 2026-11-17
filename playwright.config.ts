import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.MEGIT_E2E_PORT || 4318);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.MEGIT_E2E_OUTPUT || 'test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }],
  webServer: {
    command: 'node dist-server/server/index.js --production',
    url: `${baseURL}/api/session`,
    reuseExistingServer: false,
    env: {
      MEGIT_PORT: String(port),
      MEGIT_DATA_DIR: process.env.MEGIT_E2E_DATA_DIR || '.megit/e2e-state',
    },
  },
});
