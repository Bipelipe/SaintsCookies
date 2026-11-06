import config from './playwright.account.config.js';
export default {
  ...config,
  webServer: { ...config.webServer, command:'node scripts/test-account-server.mjs --pages' },
};
