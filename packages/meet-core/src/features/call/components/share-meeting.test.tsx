// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { buildJoinUrl, encodeRoomCode } from '../lib/room-code';

const mocks = vi.hoisted(() => ({
  app: 'meet',
  success: vi.fn(),
  error: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/runtime', () => ({
  get MEETING_APP() {
    return mocks.app;
  },
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr" data-value={value} />
  ),
}));
vi.mock('./meet-mail-share', () => ({
  MeetMailShare: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="mail handoff" /> : null,
}));

import * as topBar from './call-top-bar';
import { ShareMeetingButton } from './share-meeting';

const meetingId = '00000000-0000-4000-8000-000000000001';
const share = messages.meet.call.share;
const mail = {
  workspaceId: 'workspace',
  actorId: 'actor',
  canReadWorkspace: true,
  canManage: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.app = 'meet';
  mocks.writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
});
afterEach(cleanup);

function renderShare(rights?: Partial<typeof mail>) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareMeetingButton
        meetingId={meetingId}
        meetingName="Weekly sync"
        mail={rights ? { ...mail, ...rights } : undefined}
      />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: share.button }));
}

it('replaces the top-bar overflow menu with one Share entry', () => {
  expect('CallTopBarMore' in topBar).toBe(false);
  renderShare();
  expect(screen.getByRole('dialog', { name: share.title })).toBeTruthy();
});

it('shows the link, code and QR with copy actions', async () => {
  renderShare();
  const url = buildJoinUrl(window.location.origin, meetingId);
  const code = encodeRoomCode(meetingId);
  const link = screen.getByLabelText(share.link) as HTMLInputElement;
  expect(link.value).toBe(url);
  expect(link.readOnly).toBe(true);
  expect(link.placeholder).toBe(share.link);
  const codeField = screen.getByLabelText(
    messages.meet.call.meeting_code
  ) as HTMLInputElement;
  expect(codeField.value).toBe(code);
  expect(codeField.placeholder).toBeTruthy();
  expect(screen.getAllByText(share.qr).length).toBeGreaterThan(0);
  expect(screen.getByTestId('qr').getAttribute('data-value')).toBe(url);

  fireEvent.click(screen.getByRole('button', { name: share.copy_link }));
  await vi.waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(url));
  fireEvent.click(screen.getByRole('button', { name: share.copy_code }));
  await vi.waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(code));
  fireEvent.click(screen.getByRole('button', { name: /Copy full invite/ }));
  await vi.waitFor(() =>
    expect(mocks.writeText).toHaveBeenLastCalledWith(
      `Weekly sync\n${url}\n${messages.meet.call.meeting_code}: ${code}`
    )
  );
  expect(mocks.success).toHaveBeenLastCalledWith(
    messages.meet.call.invite_copied
  );
});

it('reports a failed copy', async () => {
  mocks.writeText.mockRejectedValue(new Error('denied'));
  renderShare();
  fireEvent.click(screen.getByRole('button', { name: share.copy_link }));
  await vi.waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith(share.copy_failed)
  );
});

it('hands off to Mail for a Meet host who can read the workspace', () => {
  renderShare({});
  fireEvent.click(screen.getByRole('button', { name: /Send by email/ }));
  expect(screen.queryByRole('dialog', { name: share.title })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'mail handoff' })).toBeTruthy();
});

it.each([
  { canReadWorkspace: false, canManage: true },
  { canReadWorkspace: true, canManage: false },
])('offers no Mail handoff without both rights %j', (rights) => {
  renderShare(rights);
  expect(screen.queryByRole('button', { name: /Send by email/ })).toBeNull();
});

it('keeps the Mail handoff out of Parley even for a host', () => {
  mocks.app = 'parley';
  renderShare({});
  expect(screen.queryByRole('button', { name: /Send by email/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Copy full invite/ })).toBeTruthy();
});
