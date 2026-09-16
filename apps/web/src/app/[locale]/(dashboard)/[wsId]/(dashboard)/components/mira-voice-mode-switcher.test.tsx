import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiraVoiceModeSwitcher } from './mira-voice-mode-switcher';

const disconnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../assistant/assistant-client', () => ({
  default: ({
    mode,
    modeControl,
    onInitializingChange,
    onComposerChange,
    onReturnToChat,
    inputOpen,
    onToggleInput,
  }: {
    mode: string;
    modeControl: ReactNode;
    onInitializingChange: (value: boolean) => void;
    onComposerChange: (value: unknown) => void;
    onReturnToChat: () => void;
    inputOpen: boolean;
    onToggleInput: () => void;
  }) => {
    useEffect(() => onInitializingChange(false), [onInitializingChange]);
    useEffect(() => {
      onComposerChange({ connected: true, disconnect, sendText: vi.fn() });
      return () => onComposerChange(null);
    }, [onComposerChange]);
    return (
      <div data-testid="voice-canvas" data-mode={mode}>
        {modeControl}
        <button type="button" onClick={onReturnToChat}>
          return_to_chat
        </button>
        <button type="button" onClick={onToggleInput}>
          {inputOpen ? 'Close input' : 'Open input'}
        </button>
      </div>
    );
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      chat_mode: 'Chat',
      live_mode: 'Live',
      mode_label: 'Assistant mode',
    })[key] ?? key,
}));

function Harness({ beforeStart }: { beforeStart?: () => Promise<void> } = {}) {
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('Keep this draft');

  return (
    <MiraVoiceModeSwitcher
      composerRef={composerRef}
      onBeforeVoiceStart={beforeStart}
      creditSource="personal"
      creditWsId="personal-workspace"
      header={(modeControl) => (
        <div data-testid="assistant-header">{modeControl}</div>
      )}
      inputRef={inputRef}
      wsId="workspace-1"
    >
      {(onVoiceToggle, _voiceActive, live) => (
        <div data-testid="chat-surface">
          <div ref={composerRef} data-testid="composer">
            {live.content}
            <textarea
              ref={inputRef}
              aria-label="Message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" onClick={onVoiceToggle}>
              Start voice
            </button>
          </div>
        </div>
      )}
    </MiraVoiceModeSwitcher>
  );
}

describe('MiraVoiceModeSwitcher', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
  );
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('mounts Live controls in the composer and toggles typing', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    const panel = await screen.findByTestId('voice-canvas');
    expect(screen.getByTestId('composer')).toContainElement(panel);
    fireEvent.click(screen.getByRole('button', { name: 'Open input' }));
    expect(screen.getByRole('button', { name: 'Close input' })).toBeVisible();
  });
  it('switches the live engine without losing the chat draft', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toHaveAttribute(
      'data-mode',
      'flash'
    );
    fireEvent.click(screen.getByRole('button', { name: 'pro_mode' }));
    await waitFor(() =>
      expect(screen.getByTestId('voice-canvas')).toHaveAttribute(
        'data-mode',
        'pro'
      )
    );
    expect(disconnect).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'pro_mode' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Keep this draft'
    );
  });
  it('waits for credit settlement before opening the replacement mode', async () => {
    let settled!: () => void;
    disconnect.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          settled = resolve;
        })
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    await screen.findByTestId('voice-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'pro_mode' }));
    expect(screen.getByTestId('voice-canvas')).toHaveAttribute(
      'data-mode',
      'flash'
    );
    expect(screen.getByRole('button', { name: 'pro_mode' })).toBeDisabled();
    settled();
    await waitFor(() =>
      expect(screen.getByTestId('voice-canvas')).toHaveAttribute(
        'data-mode',
        'pro'
      )
    );
  });
  it('opens Live when ResizeObserver is unavailable', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Keep this draft'
    );
  });

  it('keeps mode tabs out of the header and starts live from the composer', () => {
    render(<Harness />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeVisible();
    expect(screen.queryByTestId('voice-canvas')).not.toBeInTheDocument();
  });

  it('returns from the in-panel voice canvas without losing the text draft', async () => {
    render(<Harness />);
    const originalInput = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBe(
      originalInput
    );
    expect(originalInput).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'return_to_chat' }));

    const input = await screen.findByRole('textbox', { name: 'Message' });
    expect(input).toHaveValue('Keep this draft');
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('exits voice mode with Escape and restores composer focus', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toBeVisible();

    fireEvent.keyDown(window, { key: 'Escape' });

    const input = await screen.findByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('lets nested controls consume Escape without exiting voice mode', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toBeVisible();

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    event.preventDefault();
    window.dispatchEvent(event);

    expect(screen.getByTestId('voice-canvas')).toBeVisible();
  });

  it('cancels delayed composer focus when voice mode is re-entered', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    fireEvent.click(screen.getByRole('button', { name: 'return_to_chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));

    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(screen.getByTestId('voice-canvas')).toBeVisible();
    expect(
      screen.getByRole('textbox', { hidden: true, name: 'Message' })
    ).not.toHaveFocus();
  });
});

it('waits for the text stream to stop before starting Live', async () => {
  let finish!: () => void;
  const beforeStart = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  render(<Harness beforeStart={beforeStart} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
  expect(beforeStart).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('region', { name: 'Live' })
  ).not.toBeInTheDocument();
  finish();
  expect(await screen.findByTestId('voice-canvas')).toBeVisible();
});
