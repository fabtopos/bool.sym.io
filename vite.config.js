import { defineConfig } from 'vite';

export default defineConfig({
  // Works both at / and a GitHub Pages project path, without a custom domain.
  base: './',
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
