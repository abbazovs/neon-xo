import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test_secret_key_at_least_32_characters_long_xxxx',
    },
    // Don't connect to services during unit tests
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
