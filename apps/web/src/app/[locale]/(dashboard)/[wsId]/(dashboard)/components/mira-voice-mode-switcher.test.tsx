import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiraVoiceModeSwitcher } from './mira-voice-mode-switcher';

vi.mock('../assistant/assistant-client', () => ({
  default: () => <div data-testid="voice-canvas" />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      chat_mode: 'Chat',
      live_mode: 'Live',
      mode_label: 'Assistant mode',
    })[key] ?? key,
}));

function Harness() {
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('Keep this draft');

  return (
    <MiraVoiceModeSwitcher
      composerRef={composerRef}
      creditSource="personal"
      creditWsId="personal-workspace"
      header={(modeControl) => (
        <div data-testid="assistant-header">{modeControl}</div>
      )}
      inputRef={inputRef}
      wsId="workspace-1"
    >
      {(onVoiceToggle) => (
        <div ref={composerRef} data-testid="composer">
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
  it('keeps the live panel between a wrapped header and growing composer', () => {
    let resize = () => {};
    let headerHeight = 88;
    let composerHeight = 240;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return {
          height:
            this.dataset.testid === 'composer' ? composerHeight : headerHeight,
        } as DOMRect;
      }
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    const panel = screen.getByRole('region', { name: 'Live' });
    expect(panel).toHaveStyle({ top: '96px', bottom: '248px' });
    headerHeight = 124;
    composerHeight = 320;
    act(() => resize());
    expect(panel).toHaveStyle({ top: '132px', bottom: '328px' });
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
