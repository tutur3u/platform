// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

import { QaPanel } from './qa-panel';
import { resetLiveQa } from './qa-store';

afterEach(() => {
  cleanup();
  resetLiveQa('meeting-qa');
});

it('lets a host open Q&A, ask a question, and receive a participant answer', () => {
  const meetingId = 'meeting-qa';
  render(
    <QaPanel
      meetingId={meetingId}
      role="host"
      participantId="host-1"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Open Q&A/i }));
  fireEvent.change(screen.getByLabelText('Question'), {
    target: { value: 'What should we explore next?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(screen.getByText('What should we explore next?')).toBeDefined();

  cleanup();
  render(
    <QaPanel
      meetingId={meetingId}
      role="participant"
      participantId="guest-1"
    />
  );
  expect(screen.getByText('What should we explore next?')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Your answer'), {
    target: { value: 'Roadmap planning' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

  cleanup();
  render(
    <QaPanel
      meetingId={meetingId}
      role="host"
      participantId="host-1"
    />
  );
  expect(screen.getByText('Roadmap planning')).toBeDefined();
});