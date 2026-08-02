import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MiraVoiceModeSwitcher } from './mira-voice-mode-switcher';

vi.mock('../assistant/assistant-client', () => ({
  default: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="voice-canvas">
      <button type="button" onClick={onExit}>
        Back to chat
      </button>
    </div>
  ),
}));

function Harness() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('Keep this draft');

  return (
    <MiraVoiceModeSwitcher inputRef={inputRef} wsId="workspace-1">
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
  it('returns from the in-panel voice canvas without losing the text draft', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start voice' }));
    expect(await screen.findByTestId('voice-canvas')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));

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
});
