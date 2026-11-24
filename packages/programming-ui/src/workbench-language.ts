import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';

/** Runtime names are product names, the same in every locale. */
export const LANGUAGE_LABELS: Record<PlaygroundLanguage, string> = {
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

const EXTENSIONS: Record<string, PlaygroundLanguage> = {
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  java: 'java',
  rs: 'rust',
  go: 'go',
  rb: 'ruby',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
};

/** The runtime a file is written in, from its extension; undefined for data and docs files. */
export function languageForPath(path: string): PlaygroundLanguage | undefined {
  const name = path.split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return undefined;
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()];
}
