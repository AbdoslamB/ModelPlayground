export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // Component and state names use BEM-style and data attributes.
    'selector-class-pattern': null,
    // Colors are written as hex in tokens.css; keep them uppercase like the plan.
    'color-hex-length': null,
    'custom-property-pattern': null,
    // Font family names keep their capitals (Roboto, Menlo).
    'value-keyword-case': ['lower', { ignoreProperties: [/^--font-/] }],
  },
};
