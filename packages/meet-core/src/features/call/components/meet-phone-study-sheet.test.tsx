// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { MeetPhoneStudySheet } from './meet-phone-study-sheet';

function localized(child: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(cleanup);

it('renders persistent hand-raised banner and switches across Q&A, Hand, and Tutor tabs', () => {
  const onLowerHand = vi.fn();
  const onSubmitQuestion = vi.fn();
  const onUpvoteQuestion = vi.fn();
  const onSendTutorMessage = vi.fn();
  const onShareSnippet = vi.fn();
  const onExplainSimpler = vi.fn();
  const onToggleTutorVoice = vi.fn();

  const { container } = render(
    localized(
      <MeetPhoneStudySheet
        open={true}
        onOpenChange={vi.fn()}
        handRaised={true}
        handQueuePosition={2}
        onRaiseHand={vi.fn()}
        onLowerHand={onLowerHand}
        handQueue={[
          {
            userId: 'u1',
            displayName: 'Hoa Le',
            micAllowed: true,
            cameraAllowed: false,
          },
          {
            userId: 'u2',
            displayName: 'Minh Nguyen',
            micAllowed: false,
            cameraAllowed: false,
          },
        ]}
        questions={[
          {
            id: 'q1',
            body: 'Why do heartbeats reset the election timeout?',
            authorName: 'An',
            anonymous: false,
            upvotes: 5,
            answered: true,
          },
          {
            id: 'q2',
            body: 'What if two candidates split votes?',
            anonymous: true,
            upvotes: 3,
            upvoted: true,
          },
        ]}
        onSubmitQuestion={onSubmitQuestion}
        onUpvoteQuestion={onUpvoteQuestion}
        lessonChip="Slide 12 · Raft Leader Election"
        tutorMessages={[
          {
            id: 'm1',
            sender: 'user',
            body: 'Explain randomized election timeouts.',
          },
          {
            id: 'm2',
            sender: 'mira',
            body: 'Randomizing timeouts between 150ms and 300ms breaks ties.',
          },
        ]}
        tutorTyping={true}
        onSendTutorMessage={onSendTutorMessage}
        onShareSnippet={onShareSnippet}
        onExplainSimpler={onExplainSimpler}
        onToggleTutorVoice={onToggleTutorVoice}
      />
    )
  );

  // Persistent hand-raised banner
  const banner = screen.getByTestId('study-hand-raised-banner');
  expect(banner.textContent).toContain('Hand raised · #2 in queue');
  fireEvent.click(screen.getByRole('button', { name: 'Lower' }));
  expect(onLowerHand).toHaveBeenCalledOnce();

  // Q&A tab
  expect(screen.getByText('Answered')).toBeTruthy();
  expect(screen.getByText('Anonymous')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Upvote question (5)' }));
  expect(onUpvoteQuestion).toHaveBeenCalledWith('q1');

  const qaInput = screen.getByLabelText('Ask the class...');
  fireEvent.change(qaInput, {
    target: { value: 'How does log replication handle uncommitted entries?' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'Ask anonymously' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(onSubmitQuestion).toHaveBeenCalledWith(
    'How does log replication handle uncommitted entries?',
    true
  );

  // Hand tab
  fireEvent.click(screen.getByRole('tab', { name: 'Hand' }));
  const halo = screen.getByTestId('study-hand-halo');
  expect(halo.className).toContain('size-[150px]');
  expect(halo.className).toContain('motion-reduce:animate-none');
  expect(screen.getByTestId('study-hand-position').textContent).toBe(
    "You're #2 in the queue"
  );
  expect(screen.getByTestId('hand-queue-item-u1').textContent).toContain(
    'Host allowed'
  );
  expect(screen.getByTestId('hand-queue-item-u2').textContent).toContain(
    'Locked by host'
  );

  // Tutor tab
  fireEvent.click(screen.getByRole('tab', { name: 'Tutor' }));
  expect(screen.getByText('Private · only you')).toBeTruthy();
  expect(screen.getByText('Slide 12 · Raft Leader Election')).toBeTruthy();

  const miraMsg = screen.getByTestId('tutor-msg-mira');
  expect(miraMsg.style.backgroundColor).toBe('var(--mira-bg)');
  expect(screen.getByTestId('tutor-mira-typing').textContent).toContain(
    'Mira is typing...'
  );

  fireEvent.click(screen.getByRole('button', { name: 'Share snippet' }));
  fireEvent.click(screen.getByRole('button', { name: 'Explain simpler' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Mira by voice' }));
  expect(onShareSnippet).toHaveBeenCalledOnce();
  expect(onExplainSimpler).toHaveBeenCalledOnce();
  expect(onToggleTutorVoice).toHaveBeenCalledOnce();

  fireEvent.change(screen.getByLabelText('Ask Mira privately...'), {
    target: { value: 'Give me a concrete 3-node example.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(onSendTutorMessage).toHaveBeenCalledWith(
    'Give me a concrete 3-node example.'
  );

  expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
});
