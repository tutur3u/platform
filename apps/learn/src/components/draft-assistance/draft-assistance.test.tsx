import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ComponentProps, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { DraftAssistance } from './draft-assistance';
import type { Eligibility, ReviewProvider, Suggestion } from './review';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => {
    let value: unknown = messages.draftAssistance;
    for (const part of key.split('.')) {
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  },
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button {...props} />
  ),
}));

const suggestions: Suggestion[] = [
  {
    start: 0,
    end: 3,
    original: 'teh',
    replacement: 'the',
    explanation: 'Spelling',
  },
];

function Harness({
  provider,
  eligibility = 'eligible',
  disabled = false,
}: {
  provider: ReviewProvider;
  eligibility?: Eligibility;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('teh H₂O');
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <textarea
        aria-label="Draft"
        ref={ref}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <DraftAssistance
        value={value}
        onChange={setValue}
        editorRef={ref}
        provider={provider}
        eligibility={eligibility}
        disabled={disabled}
      />
    </>
  );
}

function mount(props: ComponentProps<typeof Harness>) {
  const result = render(<Harness {...props} />);
  fireEvent.click(screen.getByText(messages.draftAssistance.title));
  return result;
}
const reviewButton = () =>
  screen.getByRole('button', { name: messages.draftAssistance.review });
const draft = () =>
  screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('draft review interaction', () => {
  it.each(['unknown', 'denied'] as const)(
    'blocks %s eligibility without sending content',
    (eligibility) => {
      const provider = vi.fn();
      mount({ provider, eligibility });
      fireEvent.click(reviewButton());
      expect((reviewButton() as HTMLButtonElement).disabled).toBe(true);
      expect(provider).not.toHaveBeenCalled();
      expect(draft().disabled).toBe(false);
      expect(screen.getAllByRole('option')).toHaveLength(6);
      expect(
        screen.getByText(messages.draftAssistance.unavailable)
      ).toBeTruthy();
    }
  );

  it('previews streaming without offering edits, then accepts a selected edit and restores selection', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0)
    );
    let finish!: (edits: Suggestion[]) => void;
    const provider = vi.fn<ReviewProvider>(
      async (_request, _signal, preview) => {
        preview('Preview');
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
    );
    mount({ provider });
    draft().setSelectionRange(0, 3);
    fireEvent.click(reviewButton());
    expect(screen.queryByText('Preview')).toBeNull();
    expect(screen.getByText(messages.draftAssistance.reviewing)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: messages.draftAssistance.accept })
    ).toBeNull();
    expect(provider.mock.calls[0]?.[0]).toEqual({
      text: 'teh',
      subject: 'writing',
      locale: 'en',
    });
    await act(async () => finish(suggestions));
    fireEvent.click(
      screen.getByRole('button', { name: messages.draftAssistance.accept })
    );
    expect(draft().value).toBe('the H₂O');
    await waitFor(() => expect(document.activeElement).toBe(draft()));
    expect([draft().selectionStart, draft().selectionEnd]).toEqual([0, 3]);
  });

  it('does not overwrite concurrent unsaved draft edits', async () => {
    mount({ provider: async () => suggestions });
    fireEvent.click(reviewButton());
    await screen.findByRole('button', {
      name: messages.draftAssistance.accept,
    });
    fireEvent.change(draft(), { target: { value: 'new unsaved work' } });
    expect(
      screen.queryByRole('button', { name: messages.draftAssistance.accept })
    ).toBeNull();
    expect(screen.getByText(messages.draftAssistance.stale)).toBeTruthy();
    expect(draft().value).toBe('new unsaved work');
  });

  it('allows another review after editing and undoing an in-flight draft', () => {
    const provider = vi.fn<ReviewProvider>(() => new Promise(() => {}));
    mount({ provider });
    const original = draft().value;
    fireEvent.click(reviewButton());
    expect((reviewButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(draft(), { target: { value: 'edited draft' } });
    expect(provider.mock.calls[0]?.[1].aborted).toBe(true);
    fireEvent.change(draft(), { target: { value: original } });
    expect(draft().value).toBe(original);
    expect((reviewButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(messages.draftAssistance.reviewing)).toBeNull();
    fireEvent.click(reviewButton());
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[1]?.[1].aborted).toBe(false);
  });

  it('dismisses without changing the draft', async () => {
    mount({ provider: async () => suggestions });
    fireEvent.click(reviewButton());
    fireEvent.click(
      await screen.findByRole('button', {
        name: messages.draftAssistance.reject,
      })
    );
    expect(draft().value).toBe('teh H₂O');
    expect(screen.getByText(messages.draftAssistance.empty)).toBeTruthy();
  });

  it('retains draft after failure and retries only on explicit action', async () => {
    const provider = vi
      .fn<ReviewProvider>()
      .mockRejectedValueOnce(new Error('private provider detail'))
      .mockResolvedValueOnce(suggestions);
    mount({ provider });
    fireEvent.click(reviewButton());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('private provider detail')).toBeNull();
    expect(provider).toHaveBeenCalledTimes(1);
    expect(draft().value).toBe('teh H₂O');
    fireEvent.click(
      screen.getByRole('button', { name: messages.draftAssistance.retry })
    );
    await screen.findByRole('button', {
      name: messages.draftAssistance.accept,
    });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('cancels and ignores late results from an uncooperative provider', async () => {
    let finish!: (edits: Suggestion[]) => void;
    const provider = vi.fn<ReviewProvider>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    mount({ provider });
    fireEvent.click(reviewButton());
    fireEvent.click(
      screen.getByRole('button', { name: messages.draftAssistance.cancel })
    );
    expect(provider.mock.calls[0]?.[1].aborted).toBe(true);
    await act(async () => finish(suggestions));
    expect(
      screen.queryByRole('button', { name: messages.draftAssistance.accept })
    ).toBeNull();
    expect(draft().value).toBe('teh H₂O');
  });

  it('aborts on host removal and permission loss', () => {
    const provider = vi.fn<ReviewProvider>(() => new Promise(() => {}));
    const result = mount({ provider });
    fireEvent.click(reviewButton());
    result.rerender(<Harness provider={provider} eligibility="denied" />);
    expect(provider.mock.calls[0]?.[1].aborted).toBe(true);
    result.unmount();
  });
});
