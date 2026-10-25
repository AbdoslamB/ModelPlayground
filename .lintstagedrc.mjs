/** @type {import('lint-staged').Configuration} */
export default {
  '*.{js,mjs,ts,astro,svelte}': [
    'eslint --cache --fix --max-warnings 0 --no-warn-ignored',
    'prettier --cache --write',
  ],
  '*.css': [
    'stylelint --cache --fix --max-warnings 0',
    'prettier --cache --write',
  ],
  '*.{html,json,md,yml}': 'prettier --cache --write',
};
