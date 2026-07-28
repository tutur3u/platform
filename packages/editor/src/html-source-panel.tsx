'use client';

import { Code2 } from 'lucide-react';
import type { EditorMessages } from './types.js';

export type EditorMode = 'html' | 'visual';

export function EditorModeSwitch({
  messages,
  mode,
  onHTML,
  onVisual,
}: {
  messages: EditorMessages;
  mode: EditorMode;
  onHTML: () => void;
  onVisual: () => void;
}) {
  return (
    <fieldset
      aria-label={messages.htmlSource}
      className="tuturuuu-editor-mode-switch"
    >
      <button aria-pressed={mode === 'visual'} onClick={onVisual} type="button">
        {messages.visual}
      </button>
      <button aria-pressed={mode === 'html'} onClick={onHTML} type="button">
        <Code2 aria-hidden="true" />
        {messages.html}
      </button>
    </fieldset>
  );
}

export function HTMLSourcePanel({
  feedbackId,
  messages,
  onApply,
  onChange,
  onDiscard,
  source,
  sourceDirty,
  sourceError,
  sourceId,
  sourceNotice,
}: {
  feedbackId: string;
  messages: EditorMessages;
  onApply: () => void;
  onChange: (value: string) => void;
  onDiscard: () => void;
  source: string;
  sourceDirty: boolean;
  sourceError: string | null;
  sourceId: string;
  sourceNotice: string | null;
}) {
  return (
    <div className="tuturuuu-editor-source-panel">
      <div className="tuturuuu-editor-source-heading">
        <div>
          <label htmlFor={sourceId}>{messages.htmlSource}</label>
          <p>{messages.htmlSourceHelp}</p>
        </div>
        <div className="tuturuuu-editor-source-actions">
          <button disabled={!sourceDirty} onClick={onDiscard} type="button">
            {messages.discardHTML}
          </button>
          <button
            data-primary="true"
            disabled={!sourceDirty}
            onClick={onApply}
            type="button"
          >
            {messages.applyHTML}
          </button>
        </div>
      </div>
      <textarea
        aria-describedby={feedbackId}
        id={sourceId}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={source}
      />
      <div
        className="tuturuuu-editor-source-feedback"
        id={feedbackId}
        role={sourceError ? 'alert' : 'status'}
      >
        {sourceError ? (
          <p data-error="true">{sourceError}</p>
        ) : sourceNotice ? (
          <p data-notice="true">{sourceNotice}</p>
        ) : null}
      </div>
    </div>
  );
}
