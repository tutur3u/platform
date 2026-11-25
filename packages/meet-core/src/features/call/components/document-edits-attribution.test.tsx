// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { MeetingDocumentMiraEdit } from '@tuturuuu/internal-api/meet-call';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { DocumentEdits } from './document-edits';

const ux = vi.hoisted(() => ({ v2: true }));
vi.mock('../prejoin/prejoin-context', () => ({ useMeetUxV2: () => ux.v2 }));
afterEach(cleanup);

const edit = {
  id: '00000000-0000-4000-8000-000000000001',
  tabId: '00000000-0000-4000-8000-000000000002',
  source: 'chat',
  action: 'refine',
  askedBy: '00000000-0000-4000-8000-000000000003',
  askedByName: 'Lan',
  before: 'Old line',
  after: 'New line',
  createdAt: Date.now(),
  review: 'pending',
} as MeetingDocumentMiraEdit;
const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DocumentEdits
        edits={[edit]}
        pending={false}
        canReview={() => true}
        onReview={vi.fn()}
      />
    </NextIntlClientProvider>
  );

it('names whom each Mira edit was for under the redesign and keeps undo', () => {
  ux.v2 = true;
  show();
  expect(screen.getByText(/^Mira for Lan · /)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: messages.meet.collaboration.mira_undo })
  ).toBeTruthy();
});

it('keeps the original label with the flag off', () => {
  ux.v2 = false;
  show();
  expect(screen.getByText(/^asked by Lan · /)).toBeTruthy();
});
