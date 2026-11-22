import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';

/** Runtime names are product names, the same in every locale. */
export const PROGRAMMING_LANGUAGE_LABELS: Record<PlaygroundLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  rust: 'Rust',
  go: 'Go',
  ruby: 'Ruby',
  php: 'PHP',
  shell: 'Shell',
};
