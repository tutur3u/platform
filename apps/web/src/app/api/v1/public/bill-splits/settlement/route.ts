import { verifyTurnstileToken } from '@tuturuuu/cloudflare/turnstile/server';
import {
  createVietQr,
  planSettlement,
  type SettlementTransfer,
} from '@tuturuuu/finance-core/bill-splitting';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { admitPublicRequest } from '@tuturuuu/utils/abuse-guard/public-admission';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { getWorkspaceTier } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  confirmedPayments,
  storedSettlement,
} from '@/app/api/v1/workspaces/[wsId]/finance/bill-splits/schema';
import { billSplitStore } from '@/app/api/v1/workspaces/[wsId]/finance/bill-splits/store';
import {
  contactBankKey,
  decryptBankAccount,
} from '@/lib/finance/bill-splits/contact-bank';
import {
  billSplitStatusOrigin,
  digestStatusLinkToken,
  statusLinkToken,
} from '@/lib/finance/bill-splits/status-link';
import {
  projectSettlementStatus,
  statusCurrency,
  statusLinkScope,
} from '@/lib/finance/bill-splits/status-projection';

const policy = {
  surface: 'finance-bill-split-status',
  ipLimit: 18,
  challengeAfter: 6,
  subjectLimit: 24,
  windowMs: 60_000,
};
const bodyLimit = 4096;
const body = z.strictObject({
  token: statusLinkToken,
  challenge: z.string().max(2048).optional(),
});
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

function unavailable(challenge = false) {
  return NextResponse.json(
    { message: 'Status unavailable' },
    {
      status: 404,
      headers: {
        ...headers,
        ...(challenge ? { 'X-Abuse-Challenge': 'turnstile' } : {}),
      },
    }
  );
}

async function permittedReceivingQr(
  store: ReturnType<typeof billSplitStore>,
  scope: z.infer<typeof statusLinkScope>,
  transfers: readonly SettlementTransfer[]
) {
  if (
    process.env.ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS !== 'true' ||
    !scope.receivingConsentRevision ||
    !scope.receivingContactId ||
    !scope.receivingParticipantId
  )
    return undefined;

  const target = transfers.some(
    ({ from, to }) =>
      to === scope.receivingParticipantId &&
      (!scope.participantId ||
        from === scope.participantId ||
        to === scope.participantId)
  );
  const key = contactBankKey(process.env.FINANCE_CONTACT_BANK_ENCRYPTION_KEY);
  if (!target || !key) return undefined;

  const bank = await store.rpc('finance_contact_bank_command', {
    p_ws_id: scope.wsId,
    p_actor_id: scope.creatorId,
    p_contact_id: scope.receivingContactId,
    p_action: 'public_qr',
    p_consent_revision: scope.receivingConsentRevision,
  });
  const details = z
    .object({ bankBin: z.string(), encryptedDetails: z.string() })
    .safeParse(bank.data);
  if (bank.error || !details.success) return undefined;
  try {
    const plain = decryptBankAccount(
      details.data.encryptedDetails,
      {
        wsId: scope.wsId,
        contactId: scope.receivingContactId,
      },
      key
    );
    return createVietQr(details.data.bankBin, plain.accountNumber);
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  const origin = billSplitStatusOrigin();
  if (
    !origin ||
    request.headers.get('origin') !== origin.origin ||
    request.nextUrl.search
  ) {
    return unavailable();
  }

  try {
    if (await guardApiProxyBody(request, bodyLimit)) return unavailable();
    const input = body.safeParse(await request.json().catch(() => null));
    if (!input.success) return unavailable();

    const admission = await admitPublicRequest(request, policy, {
      verifyChallenge: async () => {
        if (!input.data.challenge) return false;
        await verifyTurnstileToken(request, input.data.challenge, {
          devMode: false,
          expectedHostname: origin.hostname,
          expectedAction: 'bill-split-status',
          includeRemoteIp: false,
        });
        return true;
      },
    });
    if (admission.kind !== 'admitted')
      return unavailable(admission.kind === 'challenge');

    const digest = digestStatusLinkToken(input.data.token);
    const store = billSplitStore(await createAdminClient({ noCookie: true }));
    const link = await store.rpc('lookup_finance_bill_split_link', {
      p_digest: digest,
    });
    const scope = statusLinkScope.safeParse(link.data);
    if (
      link.error ||
      !scope.success ||
      !(await admission.admitVerifiedSubject(digest))
    ) {
      return unavailable();
    }
    const { wsId, creatorId, splitId } = scope.data;
    if ((await getWorkspaceTier(wsId, { useAdmin: true })) === 'FREE')
      return unavailable();

    const split = await store.rpc('read_finance_bill_splits', {
      p_ws_id: wsId,
      p_actor_id: creatorId,
      p_id: splitId,
    });
    const detail = Array.isArray(split.data) ? split.data[0] : null;
    const snapshot = storedSettlement
      .extend({ currency: statusCurrency })
      .safeParse(detail);
    if (split.error || !snapshot.success) return unavailable();

    const payments = await store.rpc('finance_bill_split_confirmed_payments', {
      p_ws_id: wsId,
      p_actor_id: creatorId,
      p_split_id: splitId,
    });
    const confirmed = confirmedPayments.safeParse(payments.data);
    if (payments.error || !confirmed.success) return unavailable();

    const fresh = await store.rpc('lookup_finance_bill_split_link', {
      p_digest: digest,
    });
    const current = statusLinkScope.safeParse(fresh.data);
    if (
      fresh.error ||
      !current.success ||
      current.data.creatorId !== creatorId ||
      current.data.wsId !== wsId ||
      current.data.splitId !== splitId
    )
      return unavailable();

    const { transfers } = planSettlement({
      balances: snapshot.data.ledger.balances,
      direct: snapshot.data.input.direct,
      confirmed: confirmed.data,
    });

    const receivingQr = await permittedReceivingQr(
      store,
      current.data,
      transfers
    );
    if (receivingQr) {
      const active = await store.rpc('lookup_finance_bill_split_link', {
        p_digest: digest,
      });
      const checked = statusLinkScope.safeParse(active.data);
      if (
        active.error ||
        !checked.success ||
        checked.data.receivingConsentRevision !==
          current.data.receivingConsentRevision
      ) {
        return unavailable();
      }
    }
    return NextResponse.json(
      {
        ...projectSettlementStatus(
          current.data,
          snapshot.data.currency,
          transfers
        ),
        ...(receivingQr ? { receivingQr } : {}),
      },
      { headers }
    );
  } catch {
    return unavailable();
  }
}
