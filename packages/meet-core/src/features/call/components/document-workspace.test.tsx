// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { MeetingDocuments } from '@tuturuuu/internal-api/meet-call';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { DocumentWorkspace } from './document-workspace';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  assist: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  listMeetDocuments: api.list,
  updateMeetDocuments: api.update,
  assistMeetDocument: api.assist,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('./document-editor', () => ({
  DocumentTab: ({ tabId }: { tabId: string }) => (
    <div data-testid="document-tab">{tabId}</div>
  ),
}));

const account = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const rubric = '7f0c2e5a-4b1d-4c6e-8a9f-0d1e2f3a4b5c';
const notes = '1d3b8f9a-3a61-4b8e-9f7c-6a3d1f0c2b11';
const copy = messages.meet.collaboration;
function documents(overrides: Partial<MeetingDocuments> = {}) {
  return {
    tabs: [
      { id: 'primary', kind: 'doc', createdAt: 0, updatedAt: 0 },
      {
        id: rubric,
        kind: 'rubric',
        title: 'Lab Rubric',
        createdBy: account,
        createdAt: 1,
        updatedAt: 1,
      },
      { id: notes, kind: 'notes', createdAt: 2, updatedAt: 2 },
    ],
    mira: {
      activeTabId: rubric,
      source: 'chat',
      status: 'editing',
      section: '§2 Grading Criteria',
      askedBy: account,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    },
    edits: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        tabId: rubric,
        source: 'live',
        action: 'refine',
        askedBy: account,
        askedByName: 'Ms. Linh',
        before: 'Partial credit at instructor discretion.',
        after: 'Partial credit: award 15/30 for an off-by-one base case.',
        createdAt: Date.now() - 12_000,
        review: 'pending',
      },
    ],
    ...overrides,
  } satisfies MeetingDocuments;
}
function view() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>
          <DocumentWorkspace meetingId="meeting" accountId={account} />
        </TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  api.list.mockResolvedValue(documents());
  api.update.mockResolvedValue(documents());
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('lists every meeting document with localized defaults and Mira on her tab', async () => {
  view();
  const tablist = await screen.findByRole('tablist', { name: copy.documents });
  const tabs = within(tablist).getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    copy.document,
    'Lab Rubric',
    copy.kind_notes,
  ]);
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  expect(within(tabs[1]!).getByLabelText(copy.mira_tab_open)).toBeTruthy();
  expect(within(tabs[0]!).queryByLabelText(copy.mira_tab_open)).toBeNull();
  expect(screen.getByTestId('document-tab').textContent).toBe('primary');
});

it('jumps to the tab Mira is editing and then shows her live status', async () => {
  view();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Mira is in Lab Rubric · Jump',
    })
  );
  await waitFor(() =>
    expect(screen.getByTestId('document-tab').textContent).toBe(rubric)
  );
  expect(screen.getByText('Mira is editing §2 Grading Criteria…')).toBeTruthy();
  expect(
    screen
      .getByRole('tab', { name: /Lab Rubric/ })
      .getAttribute('aria-selected')
  ).toBe('true');
});

it('attributes Mira edits by source and lets the requester accept them', async () => {
  view();
  fireEvent.click(await screen.findByRole('tab', { name: /Lab Rubric/ }));
  const edits = await screen.findByRole('region', { name: copy.mira_edits });
  expect(within(edits).getByText('Edited by Mira (Voice Live)')).toBeTruthy();
  expect(within(edits).getByText(/asked by Ms\. Linh/)).toBeTruthy();
  fireEvent.click(within(edits).getByRole('button', { name: copy.mira_diff }));
  expect(
    within(edits).getByText('Partial credit at instructor discretion.').tagName
  ).toBe('DEL');
  fireEvent.click(
    within(edits).getByRole('button', { name: copy.mira_accept })
  );
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith('meeting', {
      action: 'review',
      editId: '00000000-0000-4000-8000-000000000001',
      decision: 'accepted',
    })
  );
});

it('keeps the primary document usable when the tab list is unavailable', async () => {
  api.list.mockRejectedValue(new Error('unavailable'));
  view();
  await waitFor(() => expect(api.list).toHaveBeenCalled());
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.getByTestId('document-tab').textContent).toBe('primary');
  expect(screen.queryByText(/Mira is/)).toBeNull();
});
