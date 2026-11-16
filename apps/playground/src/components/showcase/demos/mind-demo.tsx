'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { type RefObject, useId, useReducer, useRef } from 'react';
import { hasRoom, SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import {
  type DemoNote,
  initialMindState,
  mindReducer,
  noteDisplayTitle,
} from '@/lib/showcase/mind';
import { DemoPanel } from '../demo-panel';
import { fieldLabel, focusRing } from '../styles';

export function MindDemo() {
  const [state, dispatch] = useReducer(mindReducer, initialMindState);
  const titleRef = useRef<HTMLInputElement>(null);
  const full = !hasRoom(state.notes, SHOWCASE_LIMITS.listItems);
  const selected =
    state.notes.find((note) => note.id === state.selectedId) ?? null;

  const create = () => {
    dispatch({ type: 'create' });
    // The new note's editor mounts on the next render.
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  return (
    <DemoPanel label="Mind demo" onReset={() => dispatch({ type: 'reset' })}>
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <Button
            className="w-full"
            disabled={full}
            onClick={create}
            type="button"
          >
            New note
          </Button>
          {full ? (
            <p className="text-muted-foreground text-xs">
              Holds {SHOWCASE_LIMITS.listItems} notes. Delete one or reset.
            </p>
          ) : null}
          {state.notes.length > 0 ? (
            <ul aria-label="Notes" className="space-y-1">
              {state.notes.map((note) => {
                const active = note.id === state.selectedId;
                return (
                  <li key={note.id}>
                    <button
                      aria-pressed={active}
                      className={cn(
                        'block w-full rounded-md px-3 py-2 text-left transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/60',
                        focusRing
                      )}
                      onClick={() => dispatch({ type: 'select', id: note.id })}
                      type="button"
                    >
                      <span
                        className={cn(
                          'block truncate font-medium text-sm',
                          !note.title.trim() && 'text-muted-foreground'
                        )}
                      >
                        {noteDisplayTitle(note)}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {note.body.split('\n')[0] || 'Empty'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onChange={(patch) =>
              dispatch({ type: 'edit', id: selected.id, ...patch })
            }
            onDelete={() => dispatch({ type: 'remove', id: selected.id })}
            titleRef={titleRef}
          />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border border-dashed p-6">
            <p className="font-medium">No notes yet.</p>
            <p className="text-muted-foreground text-sm">
              Create one to start writing.
            </p>
          </div>
        )}
      </div>
    </DemoPanel>
  );
}

function NoteEditor({
  note,
  onChange,
  onDelete,
  titleRef,
}: {
  note: DemoNote;
  onChange: (patch: { title?: string; body?: string }) => void;
  onDelete: () => void;
  titleRef: RefObject<HTMLInputElement | null>;
}) {
  const titleId = useId();
  const bodyId = useId();
  const countId = useId();

  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={titleId}>
          Title
        </label>
        <Input
          ref={titleRef}
          autoComplete="off"
          id={titleId}
          maxLength={SHOWCASE_LIMITS.titleLength}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Untitled note"
          value={note.title}
        />
      </div>
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={bodyId}>
          Note
        </label>
        <Textarea
          aria-describedby={countId}
          className="min-h-48"
          id={bodyId}
          maxLength={SHOWCASE_LIMITS.bodyLength}
          onChange={(event) => onChange({ body: event.target.value })}
          placeholder="Write anything..."
          value={note.body}
        />
        <p
          className="text-right text-muted-foreground text-xs tabular-nums"
          id={countId}
        >
          {note.body.length}/{SHOWCASE_LIMITS.bodyLength}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Edits apply as you type.
        </p>
        <Button onClick={onDelete} size="sm" type="button" variant="ghost">
          Delete note
        </Button>
      </div>
    </div>
  );
}
