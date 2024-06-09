module.exports = {
  extends: ['custom', 'plugin:@tanstack/eslint-plugin-query/recommended'],
  rules: {
    '@tanstack/query/exhaustive-deps': 'error',
    '@tanstack/query/no-rest-destructuring': 'warn',
    '@tanstack/query/stable-query-client': 'error',
  },
};
