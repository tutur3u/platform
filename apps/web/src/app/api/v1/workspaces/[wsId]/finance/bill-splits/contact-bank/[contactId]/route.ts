import { createVietQr } from '@tuturuuu/finance-core/bill-splitting';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  bankAccountDetails,
  contactBankKey,
  decryptBankAccount,
  encryptBankAccount,
} from '@/lib/finance/bill-splits/contact-bank';
import {
  authorize,
  headers,
  options,
  responseError,
  storeError,
} from '../../access';
import { billSplitId } from '../../schema';
import { billSplitStore } from '../../store';

type Params = { wsId: string; contactId: string };

const bankBin = z.string().regex(/^[0-9]{6}$/);
const command = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('consent'),
    consent: z.literal(true),
    bankName: z.string().trim().min(1).max(120),
    bankBin,
    details: bankAccountDetails,
  }),
  z.strictObject({ kind: z.literal('revoke') }),
  z.strictObject({ kind: z.literal('masked_read') }),
  z.strictObject({ kind: z.literal('qr') }),
]);
const qrResult = z.object({ bankBin, encryptedDetails: z.string() });
const maskedResult = z.object({
  bankName: z.string(),
  lastFour: z.string().regex(/^[0-9A-Za-z]{4}$/),
});

export const POST = withSessionAuth<Params>(
  async (request, context, params) => {
    if (process.env.ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS !== 'true') {
      return responseError('Not found', 404);
    }
    const access = await authorize(
      request,
      context,
      params.wsId,
      'view_transactions'
    );
    if (access.response) return access.response;
    const contact = billSplitId.safeParse(params.contactId);
    if (!contact.success) return responseError('Invalid contact', 400);
    if (await guardApiProxyBody(request, 4096))
      return responseError('Invalid bank account request', 400);

    const input = command.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return responseError('Invalid bank account request', 400);
    const action = input.data.kind;
    if (
      (action === 'masked_read' || action === 'qr') &&
      !access.permissions.containsPermission('view_users_private_info')
    ) {
      return responseError('Not found', 404);
    }

    const scope = { wsId: access.wsId, contactId: contact.data };
    const key = contactBankKey(process.env.FINANCE_CONTACT_BANK_ENCRYPTION_KEY);
    if (!key && (action === 'consent' || action === 'qr')) {
      return responseError(
        'Bank account operation is temporarily unavailable',
        503
      );
    }

    const store = billSplitStore(
      await createAdminClient({ noCookie: true, auditActorId: access.actorId })
    );
    const { data, error } = await store.rpc('finance_contact_bank_command', {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_contact_id: contact.data,
      p_action: action,
      ...(input.data.kind === 'consent' && key
        ? {
            p_bank_name: input.data.bankName,
            p_bank_bin: input.data.bankBin,
            p_last_four: input.data.details.accountNumber.slice(-4),
            p_encrypted_details: encryptBankAccount(
              input.data.details,
              scope,
              key
            ),
          }
        : {}),
    });
    if (error) return storeError(error.code);
    if (!data) return responseError('Not found', 404);
    if (action === 'consent' || action === 'revoke')
      return NextResponse.json({ ok: true }, { headers });

    if (action === 'masked_read') {
      const masked = maskedResult.safeParse(data);
      if (!masked.success) return responseError('Not found', 404);
      return NextResponse.json(
        {
          bankName: masked.data.bankName,
          account: `••••${masked.data.lastFour}`,
        },
        { headers }
      );
    }

    const target = qrResult.safeParse(data);
    if (!target.success || !key) return responseError('Not found', 404);
    try {
      const details = decryptBankAccount(
        target.data.encryptedDetails,
        scope,
        key
      );
      return NextResponse.json(
        {
          qr: createVietQr(target.data.bankBin, details.accountNumber),
          holderName: details.holderName,
        },
        { headers }
      );
    } catch {
      return responseError(
        'Bank account operation is temporarily unavailable',
        503
      );
    }
  },
  options
);
