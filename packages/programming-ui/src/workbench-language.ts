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

/** Short codes for the file tab badge, where the full name does not fit. */
export const LANGUAGE_CODES: Record<PlaygroundLanguage, string> = {
  python: 'PY',
  javascript: 'JS',
  typescript: 'TS',
  c: 'C',
  cpp: 'C++',
  java: 'JAVA',
  rust: 'RS',
  go: 'GO',
  ruby: 'RB',
  php: 'PHP',
  shell: 'SH',
};

/** Tinted badge tones from the dynamic palette, so each runtime reads apart at a glance. */
export const LANGUAGE_TONES: Record<PlaygroundLanguage, string> = {
  python: 'bg-dynamic-blue/10 text-dynamic-blue',
  javascript: 'bg-dynamic-yellow/10 text-dynamic-yellow',
  typescript: 'bg-dynamic-sky/10 text-dynamic-sky',
  c: 'bg-dynamic-gray/10 text-dynamic-gray',
  cpp: 'bg-dynamic-indigo/10 text-dynamic-indigo',
  java: 'bg-dynamic-orange/10 text-dynamic-orange',
  rust: 'bg-dynamic-rose/10 text-dynamic-rose',
  go: 'bg-dynamic-cyan/10 text-dynamic-cyan',
  ruby: 'bg-dynamic-red/10 text-dynamic-red',
  php: 'bg-dynamic-purple/10 text-dynamic-purple',
  shell: 'bg-dynamic-green/10 text-dynamic-green',
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
