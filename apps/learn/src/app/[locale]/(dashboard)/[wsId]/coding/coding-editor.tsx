'use client';

import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme } from 'next-themes';
import { useCallback, useRef } from 'react';
import type { CodingLanguage } from '@/lib/coding/languages';

loader.config({ monaco });

if (typeof window !== 'undefined') {
  const globalWithMonaco = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (moduleId: string, label: string) => Worker;
    };
  };
  globalWithMonaco.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === 'typescript' || label === 'javascript') {
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/language/typescript/ts.worker.js',
            import.meta.url
          ),
          { type: 'module' }
        );
      }
      return new Worker(
        new URL(
          'monaco-editor/esm/vs/editor/editor.worker.js',
          import.meta.url
        ),
        { type: 'module' }
      );
    },
  };
}

const judgeDefinitions = `
declare module 'node:fs' {
  export function readFileSync(fd: number, encoding: 'utf8'): string;
}
declare function require(name: 'node:fs'): typeof import('node:fs');
declare function require(name: string): unknown;
declare const process: {
  stdin: { setEncoding(encoding: string): void };
  stdout: { write(value: string): void };
};
declare const Bun: {
  stdin: { text(): Promise<string> };
};
`;

monaco.typescript.javascriptDefaults.setCompilerOptions({
  allowJs: true,
  checkJs: true,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  target: monaco.typescript.ScriptTarget.ES2020,
});
monaco.typescript.typescriptDefaults.setCompilerOptions({
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  target: monaco.typescript.ScriptTarget.ES2020,
});
monaco.typescript.javascriptDefaults.addExtraLib(
  judgeDefinitions,
  'file:///judge/node-globals.d.ts'
);
monaco.typescript.typescriptDefaults.addExtraLib(
  judgeDefinitions,
  'file:///judge/node-globals.d.ts'
);

const extensions: Record<CodingLanguage, string> = {
  c: 'c',
  cpp: 'cpp',
  go: 'go',
  java: 'java',
  javascript: 'js',
  php: 'php',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  typescript: 'ts',
};

export function CodingEditor({
  challenge,
  language,
  onChange,
  onDiagnostics,
  onRun,
  source,
}: {
  challenge: string;
  language: CodingLanguage;
  onChange: (value: string) => void;
  onDiagnostics: (count: number) => void;
  onRun: () => void;
  source: string;
}) {
  const { resolvedTheme } = useTheme();
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onMount = useCallback<OnMount>((editor) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current();
    });
    editor.focus();
  }, []);

  return (
    <Editor
      height="100%"
      language={language}
      onChange={(value) => onChange(value ?? '')}
      onMount={onMount}
      onValidate={(markers) => onDiagnostics(markers.length)}
      options={{
        automaticLayout: true,
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 21,
        minimap: { enabled: false },
        padding: { top: 14, bottom: 14 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: 'on',
      }}
      path={`file:///judge/${challenge}/main.${extensions[language]}`}
      theme={resolvedTheme === 'light' ? 'vs' : 'vs-dark'}
      value={source}
    />
  );
}
