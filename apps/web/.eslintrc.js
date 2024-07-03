module.exports = {
  extends: [
    '@repo/eslint-config/next.js',
    'plugin:@next/next/recommended',
    'plugin:@tanstack/eslint-plugin-query/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: true,
  },
  rules: {
    '@tanstack/query/exhaustive-deps': 'error',
    '@tanstack/query/no-rest-destructuring': 'warn',
    '@tanstack/query/stable-query-client': 'error',

    // Consistently import navigation APIs from `@/navigation`
    // 'no-restricted-imports': [
    //   'error',
    //   {
    //     name: 'next/link',
    //     message: 'Please import from `@/navigation` instead.'
    //   },
    //   {
    //     name: 'next/navigation',
    //     importNames: ['redirect', 'permanentRedirect', 'useRouter', 'usePathname'],
    //     message: 'Please import from `@/navigation` instead.'
    //   }
    // ],
  },
};
