/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      include: ['src/models/*/math.ts'],
      // The plan requires full coverage of every model's math.
      thresholds: { 100: true },
    },
  },
});
