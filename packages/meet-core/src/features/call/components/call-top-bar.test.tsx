// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect: () => void;
  }) => (
    <button type="button" role="menuitem" onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
  }: {
    children: ReactNode;
    checked: boolean;
    onCheckedChange: () => void;
  }) => (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onCheckedChange}
    >
      {children}
    </button>
  ),
}));

import { CallTopBarConnection, CallTopBarMore } from './call-top-bar';

const meetingId = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
});
afterEach(cleanup);

function more(canReadNotes: boolean, transcriptOpen = false) {
  const onToggleTranscript = vi.fn();
  render(
    <CallTopBarMore
      meetingId={meetingId}
      meetingName="Weekly sync"
      canReadNotes={canReadNotes}
      transcriptOpen={transcriptOpen}
      onToggleTranscript={onToggleTranscript}
    />
  );
  return onToggleTranscript;
}

it('groups invite and transcript behind one named overflow control', () => {
  const onToggle = more(true, true);
  expect(screen.getByRole('button', { name: 'more' })).toBeTruthy();
  const transcript = screen.getByRole('menuitemcheckbox', { name: 'title' });
  expect(transcript.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(transcript);
  expect(onToggle).toHaveBeenCalledOnce();
  expect(screen.getByRole('menuitem', { name: 'copy_invite' })).toBeTruthy();
});

it('omits the transcript entry for people who cannot read notes', () => {
  more(false);
  expect(screen.queryByRole('menuitemcheckbox')).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'copy_invite' })).toBeTruthy();
});

it('copies the invite link with the meeting code', async () => {
  mocks.writeText.mockResolvedValue(undefined);
  more(false);
  fireEvent.click(screen.getByRole('menuitem', { name: 'copy_invite' }));
  await vi.waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
  const text = mocks.writeText.mock.calls[0]?.[0] as string;
  expect(text.startsWith('Weekly sync\n')).toBe(true);
  expect(text).toContain('meeting_code: ');
});

it('reports a failed invite copy', async () => {
  mocks.writeText.mockRejectedValue(new Error('denied'));
  more(false);
  fireEvent.click(screen.getByRole('menuitem', { name: 'copy_invite' }));
  await vi.waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith('connection_copy_failed')
  );
});

it('renders nothing while the connection is open', () => {
  const { container } = render(
    <CallTopBarConnection status="open" onRetry={vi.fn()} />
  );
  expect(container.firstChild).toBeNull();
});

it.each([
  'reconnecting',
  'connecting',
] as const)('shows only a quiet labelled indicator while %s', (status) => {
  render(<CallTopBarConnection status={status} onRetry={vi.fn()} />);
  expect(screen.getByRole('status', { name: 'reconnecting' })).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText('reconnecting')).toBeNull();
  expect(screen.queryByText('connection_refresh')).toBeNull();
});

it.each([
  'error',
  'closed',
] as const)('offers one refresh action once recovery stops (%s)', (status) => {
  const onRetry = vi.fn();
  render(<CallTopBarConnection status={status} onRetry={onRetry} />);
  expect(screen.queryByRole('status')).toBeNull();
  // getByRole throws when more than one button renders.
  const refresh = screen.getByRole('button', { name: /connection_refresh/ });
  fireEvent.click(refresh);
  expect(onRetry).toHaveBeenCalledOnce();
});
