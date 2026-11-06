'use client';
import { MousePointer2 } from '@tuturuuu/icons';
import type {
  CollaborationPresence,
  ProgrammingCollaborationClient,
} from '@tuturuuu/realtime';
import { replaceProgrammingText } from '@tuturuuu/realtime';
import type * as Y from 'yjs';
import { ProgrammingEditor } from './programming-editor';
import { useDarkSurface } from './use-dark-surface';

const REMOTE_STYLES = `.programming-remote-selection{background:color-mix(in srgb,var(--primary) 20%,transparent)}.programming-remote-caret{border-left:2px solid var(--primary)}.programming-remote-label{background:var(--primary);color:var(--primary-foreground);font-size:10px;border-radius:3px}`;

/** The editor fills whatever space the workbench leaves it; remote pointers float above. */
export function WorkbenchEditorStage({
  roomKey,
  file,
  language,
  editable,
  client,
  presence,
  actorId,
}: {
  roomKey: string;
  file: { path: string; content: string } | undefined;
  language: string;
  editable: boolean;
  client: ProgrammingCollaborationClient;
  presence: CollaborationPresence[];
  actorId: string | undefined;
}) {
  const dark = useDarkSurface();
  const others = presence.filter((person) => person.userId !== actorId);
  const ratio = (value: number, min: number, size: number) =>
    Math.max(0, Math.min(1, (value - min) / size));
  return (
    <div
      className="relative min-h-40 min-w-0 flex-1"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        client.presence({
          file: file?.path ?? null,
          pointer: {
            x: ratio(event.clientX, box.left, box.width),
            y: ratio(event.clientY, box.top, box.height),
          },
        });
      }}
      onPointerLeave={() =>
        client.presence({ file: file?.path ?? null, pointer: null })
      }
    >
      <style>{REMOTE_STYLES}</style>
      {file && (
        <ProgrammingEditor
          path={`${roomKey}/${file.path}`}
          language={language}
          value={file.content}
          readOnly={!editable}
          dark={dark}
          onChange={(value) => {
            const text = client.doc.getMap<Y.Text>('files').get(file.path);
            if (text) replaceProgrammingText(text, value);
          }}
          presence={others.map((person) => ({
            ...person,
            file: person.file ? `${roomKey}/${person.file}` : null,
          }))}
          onSelection={(selection) =>
            client.presence({ file: file.path, selection })
          }
          onCursor={(line, column) =>
            client.presence({ file: file.path, cursor: { line, column } })
          }
        />
      )}
      {others
        .filter((person) => person.pointer && person.file === file?.path)
        .map((person) => (
          <div
            key={person.connectionId}
            className="pointer-events-none absolute z-20 flex items-center gap-1 text-primary text-xs"
            style={{
              left: `${person.pointer!.x * 100}%`,
              top: `${person.pointer!.y * 100}%`,
            }}
          >
            <MousePointer2 className="size-4" />
            {person.displayName}
          </div>
        ))}
    </div>
  );
}
