import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('Keep this draft');

  return (
    <MiraVoiceModeSwitcher
      creditSource="personal"
      creditWsId="personal-workspace"
      header={(modeControl) => (
        <div data-testid="assistant-header">{modeControl}</div>
      )}
      inputRef={inputRef}
      wsId="workspace-1"
    >
      {(onVoiceToggle) => (
        <div>
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
  it('defaults to Chat and exposes one consolidated Chat and Live control', () => {
    render(<Harness />);

    expect(screen.getByRole('radio', { name: 'Chat' })).toHaveAttribute(
      'data-state',
      'on'
    );
    expect(screen.getByRole('radio', { name: 'Live' })).toHaveAttribute(
      'data-state',
      'off'
    );
    expect(screen.queryByTestId('voice-canvas')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Assistant mode')).toHaveClass(
      'h-8',
      'gap-0.5',
      'rounded-[10px]',
      'p-0.5'
    );
    expect(screen.getByLabelText('Assistant mode')).not.toHaveAttribute(
      'data-variant',
      'outline'
    );
    expect(screen.getByRole('radio', { name: 'Chat' })).not.toHaveAttribute(
      'data-variant',
      'outline'
    );
    expect(screen.getByRole('radio', { name: 'Live' })).not.toHaveAttribute(
      'data-variant',
      'outline'
    );
    expect(screen.getByRole('radio', { name: 'Chat' })).toHaveClass(
      'rounded-lg'
    );
    expect(screen.getByRole('radio', { name: 'Live' })).toHaveClass(
      'rounded-lg'
    );
    expect(screen.getByRole('radio', { name: 'Chat' })).toHaveClass(
      'focus-visible:ring-1'
    );
    expect(screen.getByTestId('assistant-header')).toContainElement(
      screen.getByLabelText('Assistant mode')
    );
  });

  it('returns from the in-panel voice canvas without losing the text draft', async () => {
    render(<Harness />);
    const originalInput = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toBeVisible();
    expect(screen.getByRole('textbox', { hidden: true, name: 'Message' })).toBe(
      originalInput
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Chat' }));

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
    fireEvent.click(screen.getByRole('radio', { name: 'Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));

    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(screen.getByTestId('voice-canvas')).toBeVisible();
    expect(
      screen.getByRole('textbox', { hidden: true, name: 'Message' })
    ).not.toHaveFocus();
  });
});
