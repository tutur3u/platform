'use client';

import { Check, Link2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ToolbarAction } from './toolbar-action.js';
import type { EditorMessages } from './types.js';
import { normalizeRichTextUrl } from './url.js';

type LinkMessages = Pick<
  EditorMessages,
  'applyLink' | 'cancel' | 'invalidLink' | 'link' | 'linkPlaceholder'
>;

export function LinkToolbarControl({
  active,
  currentHref,
  messages,
  onApply,
}: {
  active: boolean;
  currentHref: () => string;
  messages: LinkMessages;
  onApply: (href: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState('');
  const [href, setHref] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const cancel = () => {
    setError('');
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="tuturuuu-editor-link-control">
      <ToolbarAction
        active={active}
        buttonRef={buttonRef}
        icon={Link2}
        label={messages.link}
        run={() => {
          setError('');
          setHref(currentHref());
          setOpen((current) => !current);
        }}
      />
      {open ? (
        <form
          className="tuturuuu-editor-link-form"
          onSubmit={(event) => {
            event.preventDefault();
            const normalizedHref = normalizeRichTextUrl(href);
            if (normalizedHref === null) {
              setError(messages.invalidLink);
              inputRef.current?.focus();
              return;
            }
            onApply(normalizedHref);
            setError('');
            setOpen(false);
          }}
        >
          <label>
            <span className="tuturuuu-editor-visually-hidden">
              {messages.link}
            </span>
            <input
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              autoCapitalize="none"
              autoComplete="url"
              autoCorrect="off"
              inputMode="url"
              onChange={(event) => {
                setError('');
                setHref(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancel();
              }}
              placeholder={messages.linkPlaceholder}
              ref={inputRef}
              spellCheck={false}
              type="text"
              value={href}
            />
          </label>
          <ToolbarAction
            icon={Check}
            label={messages.applyLink}
            type="submit"
          />
          <ToolbarAction icon={X} label={messages.cancel} run={cancel} />
          {error ? (
            <span
              className="tuturuuu-editor-link-error"
              id={errorId}
              role="alert"
            >
              {error}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
