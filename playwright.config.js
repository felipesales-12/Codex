import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  testIgnore: '**/web/**',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8765',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `${process.platform === 'win32' ? 'python' : 'python3'} server.py --network --no-browser`,
    url: 'http://localhost:8765',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
