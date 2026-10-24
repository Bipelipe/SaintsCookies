import config from './playwright.creditos.config.js';
export default {
  ...config,
  webServer: { ...config.webServer, command:'node scripts/test-creditos-server.mjs --pages' },
};
