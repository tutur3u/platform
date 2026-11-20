import type { Json } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type Currency = { code: string; minorDigits: number };
type ParticipantAmount = { participantId: string; amountMinor: number };
type Transfer = { from: string; to: string; amountMinor: number };

export type BillSplitSummary = {
  id: string;
  title: string;
  createdAt: string;
  currency: Currency;
  revision: number;
  finalized: boolean;
};

export type BillSplitLedger = {
  balances: ParticipantAmount[];
  settlement: { optimal: boolean; transfers: Transfer[] };
  totalMinor: number;
};

export type BillSplitDetail = BillSplitSummary & {
  canManage: boolean;
  participants: {
    id: string;
    displayName: string;
    canReport: boolean;
    canConfirm: boolean;
    contactId: string | null;
  }[];
  ledger: BillSplitLedger;
};

function billSplitsPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/bill-splits`;
}

export async function listBillSplits(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const { data } = await getInternalApiClient(options).json<{
    data: BillSplitSummary[];
  }>(billSplitsPath(workspaceId), { cache: 'no-store' });
  return data;
}

export async function getBillSplit(
  workspaceId: string,
  id: string,
  options?: InternalApiClientOptions
) {
  const query = new URLSearchParams({ id });
  const { data } = await getInternalApiClient(options).json<{
    data: BillSplitDetail;
  }>(`${billSplitsPath(workspaceId)}?${query}`, { cache: 'no-store' });
  return data;
}

export function submitBillSplit(
  workspaceId: string,
  input: Json,
  preview: boolean,
  options?: InternalApiClientOptions
) {
  const path = billSplitsPath(workspaceId);
  return getInternalApiClient(options).json<{
    id?: string;
    ledger: BillSplitLedger;
  }>(preview ? `${path}?preview=1` : path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

type ActivityItem = { id: string; createdAt: string };
export type BillSplitProof = {
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  base64: string;
};

type ActivityInput =
  | { kind: 'comment'; comment: string }
  | {
      kind: 'payment_report';
      from: string;
      to: string;
      amountMinor: number;
      proof?: BillSplitProof;
    }
  | { kind: 'payment_confirm'; reportId: string };

export type BillSplitActivity =
  | (ActivityItem &
      Extract<ActivityInput, { kind: 'comment' } | { kind: 'payment_confirm' }>)
  | (ActivityItem &
      Omit<Extract<ActivityInput, { kind: 'payment_report' }>, 'proof'> & {
        hasProof?: boolean;
      });

function activityPath(workspaceId: string, id: string) {
  return `${billSplitsPath(workspaceId)}/${encodePathSegment(id)}/activity`;
}

export async function listBillSplitActivity(
  workspaceId: string,
  id: string,
  options?: InternalApiClientOptions
) {
  const { data } = await getInternalApiClient(options).json<{
    data: BillSplitActivity[];
  }>(activityPath(workspaceId, id), { cache: 'no-store' });
  return data;
}

export function writeBillSplitActivity(
  workspaceId: string,
  id: string,
  event: ActivityInput & { eventId: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string }>(
    activityPath(workspaceId, id),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  );
}

export type PublicBillSplitStatus = {
  status: 'settled' | 'outstanding';
  remainingTransfers: number;
  currency: Currency;
  name?: string;
  toPayMinor?: string;
  toReceiveMinor?: string;
  receivingQr?: string;
};

export async function checkPublicBillSplitStatus(
  token: string,
  challenge?: string,
  options?: InternalApiClientOptions
): Promise<
  | { kind: 'ready'; status: PublicBillSplitStatus }
  | { kind: 'challenge' | 'unavailable' }
> {
  const response = await getInternalApiClient(options).fetch(
    '/api/v1/public/bill-splits/settlement',
    {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, challenge }),
    }
  );

  if (!response.ok) {
    return {
      kind:
        response.headers.get('X-Abuse-Challenge') === 'turnstile'
          ? 'challenge'
          : 'unavailable',
    };
  }
  return {
    kind: 'ready',
    status: (await response.json()) as PublicBillSplitStatus,
  };
}

type StatusLink = {
  id: string;
  expiresAt: string;
  participantId: string | null;
};
type StatusCommand =
  | {
      kind: 'issue';
      hours: number;
      participantId?: string;
      publicName?: string;
      receivingParticipantId?: string;
    }
  | { kind: 'revoke'; linkId: string };

function statusLinksPath(workspaceId: string, id: string) {
  return `${billSplitsPath(workspaceId)}/${encodePathSegment(id)}/status-links`;
}

export async function listBillSplitStatusLinks(
  workspaceId: string,
  id: string
) {
  const { data } = await getInternalApiClient().json<{ data: StatusLink[] }>(
    statusLinksPath(workspaceId, id),
    { cache: 'no-store' }
  );
  return data;
}

export function writeBillSplitStatusLink(
  workspaceId: string,
  id: string,
  input: StatusCommand
) {
  return getInternalApiClient().json<{ id: string; url?: string }>(
    statusLinksPath(workspaceId, id),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

type BankInput =
  | {
      kind: 'consent';
      consent: true;
      bankName: string;
      bankBin: string;
      details: { holderName: string; accountNumber: string };
    }
  | { kind: 'revoke' | 'qr' | 'masked_read' };
type BankResult = {
  qr?: string;
  holderName?: string;
  bankName?: string;
  account?: string;
  ok?: boolean;
};

export function billSplitContactBank(
  workspaceId: string,
  contactId: string,
  input: BankInput
) {
  return getInternalApiClient().json<BankResult>(
    `${billSplitsPath(workspaceId)}/contact-bank/${encodePathSegment(contactId)}`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function downloadBillSplitProof(
  workspaceId: string,
  splitId: string,
  reportId: string
) {
  const response = await getInternalApiClient().fetch(
    `${activityPath(workspaceId, splitId)}/${encodePathSegment(reportId)}/proof`,
    { cache: 'no-store' }
  );
  if (!response.ok) throw new Error('Payment proof unavailable');
  return response.blob();
}

export function scheduleBillSplitReminder(
  workspaceId: string,
  splitId: string,
  participantId: string
) {
  return getInternalApiClient().json<{ id: string }>(
    `${billSplitsPath(workspaceId)}/${encodePathSegment(splitId)}/reminders`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId }),
    }
  );
}
