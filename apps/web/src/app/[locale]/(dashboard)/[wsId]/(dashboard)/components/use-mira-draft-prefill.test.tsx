// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ info: vi.fn() }));

vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { info: mocks.info } }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { useMiraDraftPrefill } from './use-mira-draft-prefill';

function Composer({
  draft,
  initialInput = '',
  onConsumed,
}: {
  draft?: string;
  initialInput?: string;
  onConsumed?: () => void;
}) {
  const [input, setInput] = useState(initialInput);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useMiraDraftPrefill({ draft, input, setInput, inputRef, onConsumed });
  return (
    <textarea
      aria-label="composer"
      ref={inputRef}
      value={input}
      onChange={(event) => setInput(event.target.value)}
    />
  );
}

const visit = (path: string) => window.history.replaceState(null, '', path);
const current = () => `${window.location.pathname}${window.location.search}`;
const composer = () => screen.getByRole('textbox', { name: 'composer' }) as HTMLTextAreaElement;

describe('useMiraDraftPrefill', () => {
  beforeEach(() => mocks.info.mockClear());
  afterEach(cleanup);

  it('fills and focuses an empty composer once, and clears the URL', async () => {
    visit('/en/ws-1?prompt=Plan%20my%20week&tab=x');
    const onConsumed = vi.fn();
    const { rerender } = render(<Composer draft="Plan my week" onConsumed={onConsumed} />);
    rerender(<Composer draft="Plan my week" onConsumed={onConsumed} />);

    expect(composer().value).toBe('Plan my week');
    await waitFor(() => expect(composer()).toHaveFocus());
    expect(onConsumed).toHaveBeenCalledTimes(1);
    expect(current()).toBe('/en/ws-1?tab=x');
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('keeps the user draft and adds the prompt after it, with a notice', () => {
    visit('/en/ws-1?prompt=Summarize');
    render(<Composer draft="Summarize" initialInput="My own notes" />);

    expect(composer().value).toBe('My own notes\n\nSummarize');
    expect(mocks.info).toHaveBeenCalledWith('prompt_added_to_draft');
  });

  it('does not duplicate text the composer already contains', () => {
    visit('/en/ws-1?prompt=Summarize');
    render(<Composer draft="Summarize" initialInput="Summarize" />);

    expect(composer().value).toBe('Summarize');
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('clears a rejected prompt from the URL without touching the composer', () => {
    visit('/en/ws-1?prompt=a&prompt=b');
    render(<Composer draft={undefined} initialInput="kept" />);

    expect(composer().value).toBe('kept');
    expect(current()).toBe('/en/ws-1');
  });

  it('never reapplies after the draft was consumed', () => {
    visit('/en/ws-1?prompt=Once');
    render(<Composer draft="Once" />);
    cleanup();
    // A remounted panel receives no draft and the URL no longer carries one.
    render(<Composer draft={undefined} />);

    expect(composer().value).toBe('');
    expect(current()).toBe('/en/ws-1');
  });
});
