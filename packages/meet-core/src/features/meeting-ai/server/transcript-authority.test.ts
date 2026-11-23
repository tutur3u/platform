import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authority: vi.fn(), context: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('../../live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: mocks.authority,
}));

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { requireMeetTranscriptPayer } from './transcript-authority';

const host = '00000000-0000-4000-8000-0000000000aa';
const meetingWs = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const input = { userId: host, wsId: meetingWs, meetingId: 'meeting' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ env: { MEET_AI_DISABLED: 'false' } });
});

it('bills staff to the Tuturuuu root workspace', async () => {
  mocks.authority.mockResolvedValue({ allowed: true, payer: 'tuturuuu' });
  expect(await requireMeetTranscriptPayer(input)).toEqual({
    payer: 'tuturuuu',
    billingWorkspaceId: ROOT_WORKSPACE_ID,
  });
  expect(mocks.authority).toHaveBeenCalledWith({
    accountId: host,
    workspaceId: meetingWs,
    meetingId: 'meeting',
    admitted: true,
    workspaceMember: true,
    disabledBinding: 'false',
  });
});

it('bills a paid host to the meeting workspace', async () => {
  mocks.authority.mockResolvedValue({ allowed: true, payer: 'account' });
  expect(await requireMeetTranscriptPayer(input)).toEqual({
    payer: 'account',
    billingWorkspaceId: meetingWs,
  });
});

it('refuses a free account with its own code', async () => {
  mocks.authority.mockResolvedValue({ allowed: false, reason: 'account' });
  await expect(requireMeetTranscriptPayer(input)).rejects.toMatchObject({
    status: 403,
    code: 'MEET_AI_ACCOUNT_UNAVAILABLE',
  });
});

it.each(['disabled', 'membership', 'workspace', 'identity'])(
  'refuses %s as an unavailable workspace',
  async (reason) => {
    mocks.authority.mockResolvedValue({ allowed: false, reason });
    await expect(requireMeetTranscriptPayer(input)).rejects.toMatchObject({
      status: 403,
      code: 'MEET_AI_WORKSPACE_NOT_ENABLED',
    });
  }
);

it('passes the kill switch from the Worker context, failing closed', async () => {
  mocks.context.mockRejectedValue(new Error('no context'));
  mocks.authority.mockResolvedValue({ allowed: false, reason: 'disabled' });
  await expect(requireMeetTranscriptPayer(input)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.authority).toHaveBeenCalledWith(
    expect.objectContaining({ disabledBinding: 'true' })
  );
});
