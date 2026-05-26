import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      include: ['src/modules/**/*.ts'],
      exclude: ['src/modules/**/types.ts'],
    },
  },
});
