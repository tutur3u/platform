// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { MeetPhoneLobbyPreview } from './meet-phone-lobby-preview';

function localized(child: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

it('renders 30px Mira mark, truncated title, participant pill, 4:3 preview, 60px Turnstile row, and Sign in with Tuturuuu', () => {
  const onToggleAudio = vi.fn();
  const onToggleVideo = vi.fn();
  const onSignIn = vi.fn();
  const onJoin = vi.fn();

  const { container } = render(
    localized(
      <MeetPhoneLobbyPreview
        meetingName="CS101 Lecture: Distributed Consensus & Raft Protocol Overview"
        participantCount={14}
        audioEnabled={true}
        videoEnabled={false}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        displayName="Minh"
        isGuest={true}
        turnstileStatus="verified"
        onSignIn={onSignIn}
        onJoin={onJoin}
      />
    )
  );

  const miraMark = screen.getByTestId('phone-lobby-mira-mark');
  expect(miraMark.getAttribute('width')).toBe('30');
  expect(miraMark.getAttribute('height')).toBe('30');

  const title = screen.getByRole('heading', { level: 1 });
  expect(title.className).toContain('truncate');
  expect(screen.getByText('14 in call')).toBeTruthy();

  const previewCard = screen.getByLabelText('Camera is off');
  expect(previewCard.className).toContain('aspect-4/3');

  const micBtn = screen.getByRole('button', { name: 'Mute microphone' });
  const camBtn = screen.getByRole('button', { name: 'Turn on camera' });
  expect(micBtn.getAttribute('aria-pressed')).toBe('false');
  expect(camBtn.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(micBtn);
  fireEvent.click(camBtn);
  expect(onToggleAudio).toHaveBeenCalledOnce();
  expect(onToggleVideo).toHaveBeenCalledOnce();

  const turnstileRow = screen.getByTestId('phone-turnstile-row');
  expect(turnstileRow.className).toContain('h-[60px]');
  expect(screen.getByTestId('turnstile-verified-badge')).toBeTruthy();
  expect(screen.getByText('Human check verified')).toBeTruthy();
  expect(screen.getByText('Turnstile')).toBeTruthy();

  fireEvent.click(
    screen.getByRole('button', { name: 'Sign in with Tuturuuu' })
  );
  expect(onSignIn).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('button', { name: 'Join call' }));
  expect(onJoin).toHaveBeenCalledOnce();

  // No raw Unicode emojis in UI copy
  expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
});

it('handles Turnstile retry and reduced-motion spinner while verifying/joining', () => {
  const onVerifyTurnstile = vi.fn();
  const onDisplayNameChange = vi.fn();

  render(
    localized(
      <MeetPhoneLobbyPreview
        meetingName="Office Hours"
        participantCount={2}
        audioEnabled={false}
        videoEnabled={true}
        onToggleAudio={vi.fn()}
        onToggleVideo={vi.fn()}
        displayName="Guest"
        isGuest={true}
        onDisplayNameChange={onDisplayNameChange}
        turnstileStatus="error"
        onVerifyTurnstile={onVerifyTurnstile}
        isJoining={true}
        onJoin={vi.fn()}
      />
    )
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Verification failed. Tap to retry.' })
  );
  expect(onVerifyTurnstile).toHaveBeenCalledOnce();

  const input = screen.getByLabelText('Your name');
  fireEvent.change(input, { target: { value: 'An Nguyen' } });
  expect(onDisplayNameChange).toHaveBeenCalledWith('An Nguyen');

  const joinBtn = screen.getByRole('button', { name: 'Joining...' });
  expect(joinBtn.hasAttribute('disabled')).toBe(true);
  expect(joinBtn.querySelector('.motion-reduce\\:animate-none')).toBeTruthy();
});
