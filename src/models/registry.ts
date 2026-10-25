import type { Category, ModelMeta } from './types';

import { categories } from './types';

const found = import.meta.glob<{ meta: ModelMeta }>(
  ['./*/meta.ts', '!./_template/meta.ts'],
  { eager: true },
);

/** Every model, in roadmap order. */
export const models: ModelMeta[] = Object.values(found)
  .map((module) => module.meta)
  .sort((a, b) => a.order - b.order);

export const readyModels = models.filter((m) => m.status === 'ready');
export const comingSoonModels = models.filter(
  (m) => m.status === 'coming-soon',
);

/** Models grouped by category, in sidebar order, leaving out empty groups. */
export function byCategory(
  list: ModelMeta[],
): { category: Category; models: ModelMeta[] }[] {
  return categories
    .map((category) => ({
      category,
      models: list.filter((m) => m.category === category),
    }))
    .filter((group) => group.models.length > 0);
}

/** The previous and next ready models, in roadmap order. */
export function neighbours(slug: string): {
  previous?: ModelMeta;
  next?: ModelMeta;
} {
  const index = readyModels.findIndex((m) => m.slug === slug);
  return {
    previous: index > 0 ? readyModels[index - 1] : undefined,
    next: readyModels[index + 1],
  };
}
