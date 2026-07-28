'use client';

import { code } from '@streamdown/code';
import { cn } from '@tuturuuu/utils/format';
import { Streamdown } from 'streamdown';

const plugins = { code };

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  css: 'css',
  diff: 'diff',
  go: 'go',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  jsx: 'jsx',
  kt: 'kotlin',
  md: 'markdown',
  mjs: 'javascript',
  php: 'php',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  sql: 'sql',
  swift: 'swift',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  txt: 'text',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'zsh',
};

export function RepositorySource({
  className,
  filename,
  source,
}: {
  className?: string;
  filename: string;
  source: string;
}) {
  const language = resolveLanguage(filename);
  const fence = createFence(source);

  return (
    <div
      className={cn(
        'repository-source min-w-0 overflow-hidden',
        '[&_[data-streamdown=code-block]]:my-0 [&_[data-streamdown=code-block]]:rounded-none',
        '[&_.shiki]:bg-transparent! [&_pre]:max-h-[75vh] [&_pre]:bg-transparent! [&_pre]:text-[13px] [&_pre]:leading-6',
        className
      )}
    >
      <Streamdown
        controls={{ code: true, table: false }}
        linkSafety={{ enabled: false }}
        mode="static"
        plugins={plugins}
        skipHtml
      >
        {`${fence}${language}\n${source}\n${fence}`}
      </Streamdown>
    </div>
  );
}

function resolveLanguage(filename: string) {
  const basename = filename.split('/').at(-1)?.toLowerCase() ?? '';

  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename.endsWith('.d.ts')) return 'typescript';
  if (basename.endsWith('.config.js')) return 'javascript';
  if (basename.endsWith('.config.ts')) return 'typescript';

  const extension = basename.split('.').at(-1) ?? '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}

function createFence(source: string) {
  const longestRun = [...source.matchAll(/`+/gu)].reduce(
    (length, match) => Math.max(length, match[0].length),
    0
  );

  return '`'.repeat(Math.max(3, longestRun + 1));
}
