import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  test: {
    include: ['../tests/e2e/**/*.test.js'],
    setupFiles: ['../tests/e2e/setup.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false
  },
  resolve: {
    alias: {
      'mongoose': path.resolve(workspaceRoot, 'server/node_modules/mongoose')
    }
  },
  server: {
    fs: {
      allow: [workspaceRoot]
    }
  }
});
