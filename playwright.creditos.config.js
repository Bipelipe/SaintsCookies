import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './credits-e2e',
  workers: 1,
  timeout: 60000,
  use: { baseURL:'http://127.0.0.1:8788', launchOptions:{ ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}), args:['--no-sandbox'] } },
  webServer: { command:'node scripts/test-creditos-server.mjs', url:'http://127.0.0.1:8788/api/health', timeout:120000, reuseExistingServer:false },
});
