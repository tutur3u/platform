'use client';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { CollaborationPresence } from '@tuturuuu/realtime';
import * as monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';

loader.config({ monaco });
if (typeof window !== 'undefined') {
  (
    globalThis as typeof globalThis & { MonacoEnvironment?: unknown }
  ).MonacoEnvironment = {
    getWorker(_id: string, label: string) {
      return label === 'typescript' || label === 'javascript'
        ? new Worker(
            new URL(
              'monaco-editor/language/typescript/ts.worker.js',
              import.meta.url
            ),
            { type: 'module' }
          )
        : new Worker(
            new URL('monaco-editor/editor/editor.worker.js', import.meta.url),
            { type: 'module' }
          );
    },
  };
}
export function ProgrammingEditor({
  path,
  language,
  value,
  onChange,
  readOnly,
  presence,
  onCursor,
  onSelection,
}: {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  presence: CollaborationPresence[];
  onCursor: (line: number, column: number) => void;
  onSelection: (
    selection: NonNullable<CollaborationPresence['selection']>
  ) => void;
}) {
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(
    null
  );
  const cursorCallback = useRef(onCursor);
  cursorCallback.current = onCursor;
  const selectionCallback = useRef(onSelection);
  selectionCallback.current = onSelection;
  const onMount: OnMount = (instance) => {
    editor.current = instance;
    decorations.current = instance.createDecorationsCollection();
    instance.onDidChangeCursorSelection(({ selection }) =>
      selectionCallback.current({
        startLine: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLine: selection.endLineNumber,
        endColumn: selection.endColumn,
      })
    );
    instance.onDidChangeCursorPosition((event) =>
      cursorCallback.current(event.position.lineNumber, event.position.column)
    );
  };
  useEffect(() => {
    decorations.current?.set(
      presence
        .filter((person) => person.file === path && person.cursor)
        .flatMap((person) => [
          {
            range: new monaco.Range(
              person.cursor!.line,
              person.cursor!.column,
              person.cursor!.line,
              person.cursor!.column
            ),
            options: {
              className: 'programming-remote-caret',
              stickiness:
                monaco.editor.TrackedRangeStickiness
                  .NeverGrowsWhenTypingAtEdges,
              after: {
                content: ` ${person.displayName}`,
                inlineClassName: 'programming-remote-label',
              },
              hoverMessage: { value: person.displayName },
            },
          },
          ...(person.selection
            ? [
                {
                  range: new monaco.Range(
                    person.selection.startLine,
                    person.selection.startColumn,
                    person.selection.endLine,
                    person.selection.endColumn
                  ),
                  options: {
                    className: 'programming-remote-selection',
                    stickiness:
                      monaco.editor.TrackedRangeStickiness
                        .NeverGrowsWhenTypingAtEdges,
                  },
                },
              ]
            : []),
        ])
    );
  }, [path, presence]);
  return (
    <Editor
      height="100%"
      language={language === 'shell' ? 'shell' : language}
      path={path}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      onMount={onMount}
      options={{
        readOnly,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'ui-monospace, monospace',
        scrollBeyondLastLine: false,
        padding: { top: 12 },
        wordWrap: 'on',
      }}
    />
  );
}
