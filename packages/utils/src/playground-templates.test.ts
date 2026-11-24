import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { describe, expect, it } from 'vitest';
import { playgroundTemplates } from './playground-templates';

// The execution contract: changing one of these changes what the sandbox runs.
const COMMANDS = {
  python: 'python3 main.py',
  javascript: 'node main.js',
  typescript: 'bun main.ts',
  c: 'gcc main.c -o /tmp/main && /tmp/main',
  cpp: 'g++ main.cpp -o /tmp/main && /tmp/main',
  java: 'javac Main.java && java Main',
  rust: 'rustc main.rs -o /tmp/main && /tmp/main',
  go: 'go run main.go',
  ruby: 'ruby main.rb',
  php: 'php main.php',
  shell: 'sh main.sh',
} as const;
// The packages the Go image's prebuilt GOCACHE holds.
const GO_IMPORTS = new Set([
  'bufio',
  'bytes',
  'container/heap',
  'container/list',
  'encoding/json',
  'errors',
  'fmt',
  'math',
  'math/big',
  'math/rand',
  'os',
  'regexp',
  'slices',
  'sort',
  'strconv',
  'strings',
  'sync',
  'time',
  'unicode',
]);

describe('playground starter templates', () => {
  it('covers every language with the unchanged command', () => {
    expect(Object.keys(playgroundTemplates).sort()).toEqual(
      [...PLAYGROUND_LANGUAGES].sort()
    );
    for (const language of PLAYGROUND_LANGUAGES)
      expect(playgroundTemplates[language].command).toBe(COMMANDS[language]);
  });

  it.each(PLAYGROUND_LANGUAGES)(
    '%s is formatted multi-line source',
    (language) => {
      const { content } = playgroundTemplates[language];
      expect(content.endsWith('\n')).toBe(true);
      expect(content.endsWith('\n\n')).toBe(false);
      expect(content.split('\n').length).toBeGreaterThanOrEqual(4);
      expect(content).toContain('Hello, playground!');
      expect(content).not.toMatch(/[ \t]+\n/);
      expect(content).not.toContain('\r');
      // Only Go's formatter indents with tabs.
      if (language !== 'go') expect(content).not.toContain('\t');
    }
  );

  it('keeps Java in a public Main class, the file javac expects', () => {
    expect(playgroundTemplates.java.path).toBe('Main.java');
    expect(playgroundTemplates.java.content).toContain('public class Main {');
  });

  it('imports only prebuilt standard packages in Go', () => {
    const { content } = playgroundTemplates.go;
    const imports = [...content.matchAll(/^import "([^"]+)"$/gm)].map(
      (match) => match[1] as string
    );
    expect(imports).toEqual(['fmt']);
    for (const name of imports) expect(GO_IMPORTS.has(name)).toBe(true);
    expect(content).toMatch(/^\tfmt\.Println/m);
  });

  it('prints through the language standard library only', () => {
    for (const language of PLAYGROUND_LANGUAGES)
      expect(playgroundTemplates[language].content).not.toMatch(
        /https?:\/\/|require\(|^import .* from|net\/http|curl |wget /m
      );
  });
});
