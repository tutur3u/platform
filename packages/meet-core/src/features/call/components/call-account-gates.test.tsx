// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AccountGatedPersonalDrawer,
  accountGatedCollaboration,
} from './call-account-gates';

vi.mock('./account-required-state', () => ({
  AccountRequiredState: () => <p>Sign in</p>,
}));
vi.mock('../whiteboard/board-panel', () => ({
  BoardPanel: () => <p>Board</p>,
}));
vi.mock('./document-panel', () => ({ DocumentPanel: () => null }));
vi.mock('./personal-tools-panel', () => ({
  PersonalToolsPanel: () => <p>Personal tools</p>,
}));
vi.mock('./programming-panel', () => ({ ProgrammingPanel: () => null }));
vi.mock('./resizable-call-panel', () => ({
  ResizableCallPanel: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/meeting-ai-panel', () => ({
  MeetingAiPanel: () => null,
}));
vi.mock(
  '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control',
  () => ({ NotesSharingControl: () => null })
);

afterEach(cleanup);

const board = (guests?: boolean) => ({
  show: true,
  guests,
  props: { meetingId: 'm', accountId: 'a' },
});

/** Renders what an anonymous guest sees in a collaboration pane. */
function guestPane(
  showBoard: ReturnType<typeof board> | null,
  programming = false
) {
  const content = accountGatedCollaboration(
    true,
    programming,
    false,
    null,
    null,
    showBoard
  );
  render(<>{content}</>);
}

it('keeps guests on the sign-in state unless guests may open the board', () => {
  guestPane(board());
  expect(screen.getByText('Sign in')).toBeTruthy();
  cleanup();
  guestPane(board(true));
  expect(screen.getByText('Board')).toBeTruthy();
});

it('never opens Co-Programming for a guest', () => {
  guestPane(null, true);
  expect(screen.getByText('Sign in')).toBeTruthy();
});

it('never renders PersonalToolsPanel for an anonymous guest or empty accountId', () => {
  render(
    <AccountGatedPersonalDrawer
      open
      requiresAccount
      accountId=""
      label="My day"
      onClose={() => {}}
    />
  );
  expect(screen.getByText('Sign in')).toBeTruthy();
  expect(screen.queryByText('Personal tools')).toBeNull();
  cleanup();
  render(
    <AccountGatedPersonalDrawer
      open
      requiresAccount={false}
      accountId=""
      label="My day"
      onClose={() => {}}
    />
  );
  expect(screen.getByText('Sign in')).toBeTruthy();
  expect(screen.queryByText('Personal tools')).toBeNull();
  cleanup();
  render(
    <AccountGatedPersonalDrawer
      open
      requiresAccount={false}
      accountId="actor-1"
      label="My day"
      onClose={() => {}}
    />
  );
  expect(screen.getByText('Personal tools')).toBeTruthy();
});
