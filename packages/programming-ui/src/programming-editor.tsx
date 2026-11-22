'use client';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { CollaborationPresence } from '@tuturuuu/realtime';
import type { ProgrammingMiraPresence } from '@tuturuuu/realtime/meet';
import * as monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { useEditorTheme } from './editor-colors';
import { configureScriptDiagnostics } from './editor-markers';
import { EDITOR_THEME_NAME } from './editor-theme';
import { useMiraCodeLabels } from './mira-code-presence';

const miraEditorStyles = `
.programming-mira-selection { background: color-mix(in srgb, var(--purple) 15%, transparent); box-shadow: inset 2px 0 var(--purple); }
.programming-mira-caret { border-left: 2px solid var(--purple); }
.programming-mira-label, .programming-mira-attribution {
  border-radius: 999px; margin-inline-start: 3px; padding-inline: 6px;
  color: var(--purple); background: var(--calendar-bg-purple);
  font-weight: 700; font-size: 11px;
}
.programming-mira-label { border: 1px solid var(--purple); }
`;

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
  mira,
  jump,
  onCursor,
  onSelection,
  onRunShortcut,
  scriptDiagnostics = false,
}: {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  presence: CollaborationPresence[];
  mira?: ProgrammingMiraPresence;
  jump?: { line: number; request: number };
  onCursor: (line: number, column: number) => void;
  onSelection: (
    selection: NonNullable<CollaborationPresence['selection']>
  ) => void;
  /** Cmd/Ctrl+Enter inside the editor; Monaco consumes the key before the page sees it. */
  onRunShortcut?: () => void;
  /** Meetings only: TypeScript and JavaScript problems tuned for a Node playground. */
  scriptDiagnostics?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useEditorTheme(host);
  const runShortcut = useRef(onRunShortcut);
  runShortcut.current = onRunShortcut;
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const labels = useMiraCodeLabels(mira);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(
    null
  );
  const cursorCallback = useRef(onCursor);
  cursorCallback.current = onCursor;
  const selectionCallback = useRef(onSelection);
  selectionCallback.current = onSelection;
  const onMount: OnMount = (instance) => {
    setEditor(instance);
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      runShortcut.current?.()
    );
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
  }, [editor, path, presence]);

  useEffect(() => {
    if (!editor || !mira?.startLine || !mira.endLine) return;
    const model = editor.getModel();
    if (!model || mira.startLine > model.getLineCount()) return;
    const start = mira.startLine;
    const end = Math.min(mira.endLine, model.getLineCount());
    const anchor = model.getLineMaxColumn(start);
    const items: monaco.editor.IModelDeltaDecoration[] = [];
    if (
      mira.active ||
      mira.proposedFix?.status === 'proposed' ||
      labels.attribution
    ) {
      items.push({
        range: new monaco.Range(start, 1, end, model.getLineMaxColumn(end)),
        options: {
          isWholeLine: true,
          className: 'programming-mira-selection',
          linesDecorationsClassName: 'programming-mira-caret',
        },
      });
    }
    if (mira.active || mira.proposedFix?.status === 'proposed') {
      items.push({
        range: new monaco.Range(start, anchor, start, anchor),
        options: {
          after: {
            content: labels.caret,
            inlineClassName: 'programming-mira-label',
          },
        },
      });
    }
    if (labels.attribution) {
      items.push({
        range: new monaco.Range(start, anchor, start, anchor),
        options: {
          after: {
            content: labels.attribution,
            inlineClassName: 'programming-mira-attribution',
          },
        },
      });
    }
    const collection = editor.createDecorationsCollection(items);
    return () => collection.clear();
  }, [editor, path, value, mira, labels.attribution, labels.caret]);

  useEffect(() => {
    monaco.editor.defineTheme(EDITOR_THEME_NAME, theme);
    monaco.editor.setTheme(EDITOR_THEME_NAME);
  }, [theme]);

  useEffect(() => {
    if (!editor || !jump) return;
    const line = Math.min(jump.line, editor.getModel()?.getLineCount() ?? 1);
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, [editor, path, jump]);
  return (
    <div ref={host} className="h-full min-h-0">
      <style>{miraEditorStyles}</style>
      <Editor
        height="100%"
        language={language}
        path={path}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={onMount}
        beforeMount={(instance) => {
          if (scriptDiagnostics) configureScriptDiagnostics(instance);
          instance.editor.defineTheme(EDITOR_THEME_NAME, theme);
        }}
        theme={EDITOR_THEME_NAME}
        options={{
          readOnly,
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          wordWrap: 'on',
          renderLineHighlight: 'line',
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        }}
      />
    </div>
  );
}
