import { defineConfig } from 'vite';

// GitHub Pages serves this project under /SaintsCookies/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/SaintsCookies/' : '/',
}));
