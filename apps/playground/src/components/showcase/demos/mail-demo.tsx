'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import {
  type FormEvent,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from 'react';
import { hasRoom, SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import {
  initialMailState,
  MAIL_FOLDER_LABELS,
  MAIL_FOLDERS,
  mailReducer,
  messagesIn,
  unreadCount,
} from '@/lib/showcase/mail';
import { DemoPanel, FieldMessage } from '../demo-panel';
import { fieldLabel, focusRing } from '../styles';

type Draft = { to: string; subject: string; body: string };
const EMPTY_DRAFT: Draft = { to: '', subject: '', body: '' };

export function MailDemo() {
  const [state, dispatch] = useReducer(mailReducer, initialMailState);
  const [composing, setComposing] = useState(false);
  const composeRef = useRef<HTMLButtonElement>(null);
  const visible = messagesIn(state.messages, state.folder);
  const selected =
    visible.find((message) => message.id === state.selectedId) ?? null;
  const unread = unreadCount(state.messages);
  const full = !hasRoom(state.messages, SHOWCASE_LIMITS.listItems);

  return (
    <DemoPanel
      label="Mail demo"
      onReset={() => {
        dispatch({ type: 'reset' });
        setComposing(false);
      }}
    >
      <div className="grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <Button
            ref={composeRef}
            className="w-full"
            disabled={composing}
            onClick={() => setComposing(true)}
            type="button"
          >
            Compose
          </Button>
          <nav aria-label="Folders">
            <ul className="flex gap-1 overflow-x-auto md:flex-col">
              {MAIL_FOLDERS.map((folder) => {
                const current = !composing && state.folder === folder;
                return (
                  <li key={folder}>
                    <button
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                        current
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        focusRing
                      )}
                      onClick={() => {
                        setComposing(false);
                        dispatch({ type: 'open-folder', folder });
                      }}
                      type="button"
                    >
                      {MAIL_FOLDER_LABELS[folder]}
                      {folder === 'inbox' && unread > 0 ? (
                        <span className="text-xs tabular-nums">
                          {unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {composing ? (
          <ComposeForm
            full={full}
            onCancel={() => {
              setComposing(false);
              requestAnimationFrame(() => composeRef.current?.focus());
            }}
            onSend={(draft) => {
              dispatch({ type: 'send', ...draft });
              setComposing(false);
            }}
          />
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            {visible.length === 0 ? (
              <p className="rounded-md border border-border border-dashed p-4 text-muted-foreground text-sm lg:col-span-2">
                {MAIL_FOLDER_LABELS[state.folder]} is empty.
              </p>
            ) : (
              <>
                <ul
                  aria-label={MAIL_FOLDER_LABELS[state.folder]}
                  className="divide-y divide-border rounded-lg border border-border"
                >
                  {visible.map((message) => {
                    const active = message.id === selected?.id;
                    return (
                      <li key={message.id}>
                        <button
                          aria-pressed={active}
                          className={cn(
                            'block w-full px-3 py-2.5 text-left transition-colors',
                            active
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/60',
                            focusRing
                          )}
                          onClick={() =>
                            dispatch({ type: 'select', id: message.id })
                          }
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            {!message.read ? (
                              <span className="size-2 shrink-0 rounded-full bg-primary">
                                <span className="sr-only">Unread: </span>
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                'truncate text-sm',
                                !message.read && 'font-semibold'
                              )}
                            >
                              {state.folder === 'sent'
                                ? `To ${message.correspondent}`
                                : message.correspondent}
                            </span>
                          </span>
                          <span className="block truncate text-muted-foreground text-sm">
                            {message.subject}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {selected ? (
                  <article className="min-w-0 rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold">
                          {selected.subject}
                        </h3>
                        <p className="break-words text-muted-foreground text-sm">
                          {selected.folder === 'sent' ? 'To ' : 'From '}
                          {selected.correspondent}
                        </p>
                      </div>
                      {selected.folder === 'inbox' ? (
                        <Button
                          onClick={() =>
                            dispatch({ type: 'archive', id: selected.id })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Archive
                        </Button>
                      ) : selected.folder === 'archive' ? (
                        <Button
                          onClick={() =>
                            dispatch({ type: 'restore', id: selected.id })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Move to Inbox
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm">
                      {selected.body || 'No message body.'}
                    </p>
                  </article>
                ) : (
                  <p className="rounded-md border border-border border-dashed p-4 text-muted-foreground text-sm">
                    Select a message to read it.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </DemoPanel>
  );
}

function ComposeForm({
  full,
  onSend,
  onCancel,
}: {
  full: boolean;
  onSend: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showError, setShowError] = useState(false);
  const toId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const errorId = useId();
  const toRef = useRef<HTMLInputElement>(null);
  const missingTo = !draft.to.trim();
  const missingSubject = !draft.subject.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (full) return;
    if (missingTo || missingSubject) return setShowError(true);
    onSend(draft);
  };

  // Compose opens from a button; move focus into the new form.
  useEffect(() => {
    toRef.current?.focus();
  }, []);

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <form
      aria-label="New message"
      className="min-w-0 space-y-3"
      noValidate
      onSubmit={submit}
    >
      <h3 className="font-semibold text-sm">New message</h3>
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={toId}>
          To
        </label>
        <Input
          aria-describedby={showError && missingTo ? errorId : undefined}
          aria-invalid={showError && missingTo}
          ref={toRef}
          autoComplete="off"
          id={toId}
          maxLength={SHOWCASE_LIMITS.addressLength}
          onChange={(event) => update({ to: event.target.value })}
          placeholder="Name or address"
          value={draft.to}
        />
      </div>
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={subjectId}>
          Subject
        </label>
        <Input
          aria-describedby={showError && missingSubject ? errorId : undefined}
          aria-invalid={showError && missingSubject}
          autoComplete="off"
          id={subjectId}
          maxLength={SHOWCASE_LIMITS.titleLength}
          onChange={(event) => update({ subject: event.target.value })}
          value={draft.subject}
        />
      </div>
      <div className="space-y-1.5">
        <label className={fieldLabel} htmlFor={bodyId}>
          Message
        </label>
        <Textarea
          id={bodyId}
          maxLength={SHOWCASE_LIMITS.bodyLength}
          onChange={(event) => update({ body: event.target.value })}
          rows={5}
          value={draft.body}
        />
      </div>
      {showError && (missingTo || missingSubject) ? (
        <FieldMessage id={errorId}>Add a recipient and a subject.</FieldMessage>
      ) : null}
      {full ? (
        <p className="text-muted-foreground text-sm">
          The mailbox holds {SHOWCASE_LIMITS.listItems} messages. Reset to send
          more.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Nothing is delivered. Sent mail stays in this demo.
      </p>
      <div className="flex gap-2">
        <Button disabled={full} type="submit">
          Send
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
