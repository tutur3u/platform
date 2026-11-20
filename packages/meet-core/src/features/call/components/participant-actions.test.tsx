// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ParticipantActions } from './participant-actions';

afterEach(cleanup);

it('groups member actions and requires explicit confirmation before removing someone', () => {
  const onRemove = vi.fn();
  const person = {
    userId: 'attendee',
    displayName: 'Dan',
    role: 'speaker',
    media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
  } as MeetRealtimePresence;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantActions
        person={person}
        onRemove={onRemove}
        onMute={vi.fn()}
      />
    </NextIntlClientProvider>
  );
  const trigger = screen.getByRole('button', { name: 'Actions for Dan' });
  const remove = messages.meet.call.remove_participant;
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: remove }));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.call.cancel })
  );
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: remove }));
  fireEvent.click(screen.getByRole('button', { name: remove }));
  expect(onRemove).toHaveBeenCalledWith('attendee');
});
