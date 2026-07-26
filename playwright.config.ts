import { defineConfig, devices } from '@playwright/test';

const e2eEnvironment = {
  DATABASE_URL: 'file:./e2e.db',
  JWT_SECRET: 'ticketbase-e2e-secret',
  PORT: '3100',
  RATE_LIMIT_MAX: '1000',
  FRONTEND_HOST: '127.0.0.1',
  FRONTEND_PORT: '5174',
  API_PROXY_TARGET: 'http://127.0.0.1:3100',
  WEBHOOK_SECRET: 'ticketbase-e2e-webhook-secret',
};

export default defineConfig({
  testDir: 'src/tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:e2e:backend',
      url: 'http://127.0.0.1:3100',
      env: e2eEnvironment,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run start:e2e:frontend',
      url: 'http://127.0.0.1:5174/login',
      env: e2eEnvironment,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
