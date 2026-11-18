// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { MeetPhoneBottomSheet } from './meet-phone-bottom-sheet';

function localized(child: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

const basePoll = {
  id: 'poll-1',
  question: 'Which consensus guarantee prevents split brain?',
  timerLabel: '01:42',
  anonymous: true,
  multiSelect: false,
  totalVotes: 24,
  options: [
    { id: 'opt-a', label: 'Quorum intersection', votes: 18 },
    { id: 'opt-b', label: 'Client retry backoff', votes: 6 },
  ],
  miraSummary:
    'Most participants favor quorum intersection across odd replicas.',
};

const baseDocs = [
  {
    id: 'doc-1',
    title: 'Raft Notes.md',
    miraAttribution: 'voice_live' as const,
    miraEditSummary: 'Added quorum proof steps from live lecture.',
    diffBefore: 'Majority = N / 2',
    diffAfter: 'Majority = floor(N / 2) + 1',
  },
  {
    id: 'doc-2',
    title: 'Lab Checklist.md',
    miraAttribution: 'chat' as const,
    miraEditSummary: 'Added test harness commands from Room Chat.',
  },
];

const collaborators = [
  { id: 'u1', name: 'Linh Tran', status: 'Editing' },
  { id: 'u2', name: 'Hoa Le', status: 'Viewing' },
];

it('renders dimmed 2-tile preview, rounded-t-[28px] dialog, Poll tab voting, and Docs tab Mira controls', () => {
  const onOpenChange = vi.fn();
  const onSubmitVote = vi.fn();
  const onAcceptMiraEdit = vi.fn();
  const onUndoMiraEdit = vi.fn();

  const { container } = render(
    localized(
      <MeetPhoneBottomSheet
        open={true}
        onOpenChange={onOpenChange}
        previewTiles={[
          { id: 't1', name: 'Prof. Linh', subtitle: 'Host' },
          { id: 't2', name: 'Mira', isMira: true, subtitle: 'Live' },
        ]}
        poll={basePoll}
        onSubmitVote={onSubmitVote}
        docs={baseDocs}
        collaborators={collaborators}
        onAcceptMiraEdit={onAcceptMiraEdit}
        onUndoMiraEdit={onUndoMiraEdit}
      />
    )
  );

  const dialog = screen.getByRole('dialog', { name: 'Live in this call' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.className).toContain('rounded-t-[28px]');
  expect(dialog.className).toContain('border-t');
  expect(dialog.className).toContain('motion-reduce:animate-none');

  const grabber = screen.getByTestId('phone-sheet-grabber');
  expect(grabber.className).toContain('w-[36px]');
  expect(grabber.className).toContain('h-[4px]');

  expect(screen.getByTestId('phone-sheet-dimmed-preview')).toBeTruthy();

  // Poll tab
  expect(screen.getByText('01:42')).toBeTruthy();
  expect(screen.getByText('Anonymous')).toBeTruthy();
  const optionRadio = screen.getByRole('radio', {
    name: /Quorum intersection/,
  });
  expect(optionRadio.querySelector('.font-mono')).toBeTruthy();
  fireEvent.click(optionRadio);
  fireEvent.click(screen.getByRole('button', { name: 'Submit vote' }));
  expect(onSubmitVote).toHaveBeenCalledWith(['opt-a']);
  expect(screen.getAllByRole('progressbar').length).toBe(2);
  expect(screen.getByTestId('poll-mira-summary').textContent).toContain(
    'Mira live summary'
  );

  // Switch to Docs tab
  expect(screen.getByTestId('docs-mira-dot')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Docs' }));

  expect(screen.getByText('Multi-doc · Paid')).toBeTruthy();
  expect(screen.getByTestId('docs-mira-card').textContent).toContain(
    'Edited by Mira (Voice Live)'
  );

  fireEvent.click(screen.getByRole('button', { name: 'Diff' }));
  expect(screen.getByTestId('docs-diff-preview').textContent).toContain(
    'Majority = floor(N / 2) + 1'
  );

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(onAcceptMiraEdit).toHaveBeenCalledWith('doc-1');

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(onUndoMiraEdit).toHaveBeenCalledWith('doc-1');

  // Switch doc pill
  fireEvent.click(screen.getByRole('button', { name: 'Lab Checklist.md' }));
  expect(screen.getByTestId('docs-mira-card').textContent).toContain(
    'Added by Mira (Chat)'
  );

  expect(screen.getByText('Linh Tran')).toBeTruthy();
  expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
});

it('dismisses on Escape key, backdrop click, and close button', () => {
  const onOpenChange = vi.fn();

  render(
    localized(
      <MeetPhoneBottomSheet
        open={true}
        onOpenChange={onOpenChange}
        poll={basePoll}
        docs={baseDocs}
      />
    )
  );

  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(screen.getByTestId('phone-sheet-backdrop'));
  fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));

  expect(onOpenChange).toHaveBeenCalledTimes(3);
  expect(onOpenChange).toHaveBeenNthCalledWith(1, false);
  expect(onOpenChange).toHaveBeenNthCalledWith(2, false);
  expect(onOpenChange).toHaveBeenNthCalledWith(3, false);
});
