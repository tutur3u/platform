// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgrammingEditor } from './programming-editor';

const configure = vi.hoisted(() => vi.fn());
const defineTheme = vi.hoisted(() => vi.fn());

vi.mock('monaco-editor', () => ({
  editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
  KeyMod: {},
  KeyCode: {},
}));
vi.mock('@monaco-editor/react', () => ({
  loader: { config: vi.fn() },
  default: ({ beforeMount }: { beforeMount: (instance: unknown) => void }) => {
    beforeMount({ editor: { defineTheme } });
    return null;
  },
}));
vi.mock('./editor-markers', () => ({ configureScriptDiagnostics: configure }));
vi.mock('./editor-colors', () => ({ useEditorTheme: () => ({}) }));
vi.mock('./mira-code-presence', () => ({
  useMiraCodeLabels: () => ({ attribution: '', caret: '' }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const editor = (scriptDiagnostics?: boolean) => (
  <ProgrammingEditor
    path="room/main.ts"
    language="typescript"
    value=""
    readOnly={false}
    presence={[]}
    onChange={vi.fn()}
    onCursor={vi.fn()}
    onSelection={vi.fn()}
    scriptDiagnostics={scriptDiagnostics}
  />
);

it('leaves Monaco defaults alone outside meetings', () => {
  render(editor());
  expect(configure).not.toHaveBeenCalled();
  expect(defineTheme).toHaveBeenCalled();
});

it('tunes TypeScript and JavaScript problems for meetings', () => {
  render(editor(true));
  expect(configure).toHaveBeenCalledTimes(1);
});
