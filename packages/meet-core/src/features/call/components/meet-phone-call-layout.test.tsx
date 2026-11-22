// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { MeetPhoneCallLayout } from './meet-phone-call-layout';

function localized(child: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

it('renders spotlight tile, 104px Self-PiP, Mira live caption, status strip, 3-tile row, and 46px dock', () => {
  const onOpenMira = vi.fn();
  const onOpenParticipants = vi.fn();
  const onLeave = vi.fn();

  const { container } = render(
    localized(
      <MeetPhoneCallLayout
        spotlight={{
          userId: 'host-1',
          displayName: 'Prof. Linh',
          isHost: true,
          isSpeaking: true,
          micOn: true,
          videoOn: false,
        }}
        self={{
          userId: 'self-1',
          displayName: 'Minh',
          micOn: false,
          videoOn: false,
        }}
        nextParticipant={{
          userId: 'peer-2',
          displayName: 'Hoa',
          handRaised: true,
          micOn: false,
        }}
        overflowCount={7}
        miraStatus="speaking"
        miraMode="live"
        miraCaption="Try checking the leader term before appending."
        micOn={false}
        cameraOn={false}
        cameraLocked={false}
        handRaised={false}
        onToggleMic={vi.fn()}
        onToggleCamera={vi.fn()}
        onToggleHand={vi.fn()}
        onOpenMira={onOpenMira}
        onOpenMore={vi.fn()}
        onOpenParticipants={onOpenParticipants}
        onLeave={onLeave}
      />
    )
  );

  const spotlight = screen.getByTestId('phone-spotlight-tile');
  expect(spotlight.className).toContain('min-h-[360px]');
  expect(spotlight.className).toContain('ring-dynamic-green');
  expect(screen.getByTestId('phone-spotlight-host-pill').textContent).toBe(
    'Host'
  );

  const selfPip = screen.getByTestId('phone-self-pip');
  expect(selfPip.className).toContain('w-[104px]');

  const caption = screen.getByTestId('phone-mira-caption');
  expect(caption.textContent).toContain('Mira:');
  expect(caption.textContent).toContain(
    'Try checking the leader term before appending.'
  );

  const statusStrip = screen.getByTestId('phone-mira-status-strip');
  expect(statusStrip.textContent).toContain('Mira is speaking');
  expect(
    statusStrip.querySelector('.motion-reduce\\:animate-none')
  ).toBeTruthy();

  const miraTile = screen.getByTestId('phone-mira-tile');
  expect(miraTile.className).toContain('mira-speaking');
  expect(miraTile.className).toContain('motion-reduce:animate-none');
  expect(miraTile.textContent).toContain('Live');
  expect(miraTile.textContent).toContain(en.meet.mira_adults.badge);
  expect(
    screen.getAllByRole('button', {
      name: en.meet.call.phone.mira_open_label,
      description: en.meet.mira_adults.notice,
    })
  ).toHaveLength(2);
  fireEvent.click(miraTile);
  expect(onOpenMira).toHaveBeenCalledOnce();

  expect(screen.getByTestId('phone-next-hand-badge')).toBeTruthy();

  const overflowTile = screen.getByTestId('phone-overflow-tile');
  expect(overflowTile.textContent).toContain('+7');
  fireEvent.click(overflowTile);
  expect(onOpenParticipants).toHaveBeenCalledOnce();

  const micBtn = screen.getByRole('button', { name: 'Unmute microphone' });
  expect(micBtn.className).toContain('size-[46px]');

  fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
  expect(onLeave).toHaveBeenCalledOnce();

  expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
});

it('shows locked camera badge and tooltip without toggling camera when host disables cameras', () => {
  const onToggleCamera = vi.fn();
  const onToggleHand = vi.fn();

  render(
    localized(
      <MeetPhoneCallLayout
        spotlight={{
          userId: 'host-1',
          displayName: 'Prof. Linh',
          isHost: true,
        }}
        self={{ userId: 'self-1', displayName: 'Minh' }}
        miraStatus="typing"
        miraMode="chat"
        micOn={true}
        cameraOn={false}
        cameraLocked={true}
        handRaised={false}
        onToggleMic={vi.fn()}
        onToggleCamera={onToggleCamera}
        onToggleHand={onToggleHand}
        onLeave={vi.fn()}
      />
    )
  );

  expect(screen.getByTestId('phone-mira-status-strip').textContent).toContain(
    'Mira is typing in Room Chat'
  );
  expect(screen.getByTestId('phone-mira-tile').textContent).toContain('Chat');
  expect(screen.getByTestId('phone-camera-lock-badge')).toBeTruthy();

  const camBtn = screen.getByTestId('phone-camera-button');
  expect(camBtn.getAttribute('aria-disabled')).toBe('true');

  fireEvent.click(camBtn);
  expect(onToggleCamera).not.toHaveBeenCalled();

  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.textContent).toContain(
    'Host disabled cameras for participants'
  );
  expect(tooltip.textContent).toContain('Raise your hand to ask');

  // Quick raise-hand action inside locked tooltip
  const raiseHandButtons = screen.getAllByRole('button', {
    name: 'Raise hand',
  });
  fireEvent.click(raiseHandButtons[0]!);
  expect(onToggleHand).toHaveBeenCalledOnce();
});
