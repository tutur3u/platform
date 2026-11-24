import { beforeEach, expect, it, vi } from 'vitest';

// The transcript and notes payer rule end to end (#8460): the account payer
// decided from the current Auth identity, the billing workspace it maps to,
// and the credit admission that checks that workspace's plan.
const check = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: check,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { miraAccountPayer } from '../../live-assistant/demo-admission';
import { miraBillingWorkspaceId } from '../../live-assistant/mira-entitlement';
import { admitMeetCredits } from './credit-admission';

const meetingWs = '071e0fc7-0000-4000-8000-000000000001';
const confirmed = '2026-01-01T00:00:00Z';
const staff = {
  id: 'staff',
  email: 'host@tuturuuu.com',
  email_confirmed_at: confirmed,
  identities: [{ provider: 'email', identity_data: {} }],
};
const qa = {
  ...staff,
  id: 'qa',
  email: 'qa+abcd1234-1@tuturuuu.com',
  app_metadata: {
    qa_test: true,
    qa_staff: true,
    qa_expires_at: '2999-01-01T00:00:00Z',
  },
};
const customer = { ...staff, id: 'customer', email: 'host@example.com' };

function billingWorkspace(
  actor: typeof staff & { app_metadata?: Record<string, unknown> },
  paidAccount: boolean
) {
  const payer = miraAccountPayer(actor, paidAccount);
  return payer ? miraBillingWorkspaceId(payer, meetingWs) : null;
}

const allowed = { allowed: true, tier: 'FREE', maxOutputTokens: 2048 };
beforeEach(() => vi.resetAllMocks());

it('bills a verified-staff host to the root workspace', async () => {
  const workspaceId = billingWorkspace(staff, false);
  expect(workspaceId).toBe(ROOT_WORKSPACE_ID);
  check.mockResolvedValue(allowed);
  await expect(
    admitMeetCredits(staff.id, 'meeting', workspaceId!)
  ).resolves.toMatchObject({ workspaceId: ROOT_WORKSPACE_ID });
  expect(check).toHaveBeenCalledWith(
    ROOT_WORKSPACE_ID,
    'google/gemini-3.1-flash-lite',
    'generate',
    { userId: staff.id }
  );
});

it('bills a paid non-staff host to the meeting workspace', () => {
  expect(billingWorkspace(customer, true)).toBe(meetingWs);
  expect(billingWorkspace(customer, false)).toBeNull();
});

it('never treats a QA account as staff, even a QA staff host', () => {
  // Without a paid plan a QA account is no payer at all; with one it pays
  // from the meeting workspace, never root.
  expect(billingWorkspace(qa, false)).toBeNull();
  expect(billingWorkspace(qa, true)).toBe(meetingWs);
  expect(
    billingWorkspace({ ...staff, app_metadata: { qa_test: true } }, true)
  ).toBe(meetingWs);
});

it('still refuses a non-staff payer whose plan lacks the model with 402', async () => {
  check.mockResolvedValue({ allowed: false, errorCode: 'MODEL_NOT_ALLOWED' });
  await expect(
    admitMeetCredits(customer.id, 'meeting', billingWorkspace(customer, true)!)
  ).rejects.toMatchObject({
    status: 402,
    code: 'MEET_AI_MODEL_NOT_ON_PLAN',
    message: 'AI credits unavailable for the meeting workspace',
  });
});

it('names root staff billing, not the meeting workspace, when root refuses', async () => {
  check.mockResolvedValue({ allowed: false, errorCode: 'MODEL_NOT_ALLOWED' });
  await expect(
    admitMeetCredits(staff.id, 'meeting', ROOT_WORKSPACE_ID)
  ).rejects.toMatchObject({
    status: 402,
    message: 'AI credits unavailable for Tuturuuu staff billing',
  });
  check.mockResolvedValue({ allowed: false, errorCode: 'CREDITS_EXHAUSTED' });
  await expect(
    admitMeetCredits(staff.id, 'meeting', ROOT_WORKSPACE_ID)
  ).rejects.toMatchObject({
    message: 'Tuturuuu staff billing is out of AI credits',
  });
});
