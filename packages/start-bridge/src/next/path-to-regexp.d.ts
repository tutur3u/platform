// Next's compiled path-to-regexp ships without type declarations.
declare module 'next/dist/compiled/path-to-regexp' {
  export function pathToRegexp(path: string): RegExp;
}
