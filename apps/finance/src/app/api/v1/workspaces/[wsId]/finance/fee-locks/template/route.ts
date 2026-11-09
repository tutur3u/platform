import { validateFeeNoticeTemplate } from '@tuturuuu/finance-core/fee-lock';
import {
  FEE_NOTICE_TEMPLATE_INVALID_CODE,
  FEE_NOTICE_TEMPLATE_VERSION_CONFLICT_CODE,
  type FeeNoticeTemplateResponse,
  feeNoticeTemplateSaveRequestSchema,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { NextResponse } from 'next/server';
import { feeLockErrorResponse, getFeeLockRouteContext } from '../access';
import {
  activeFeeNoticeTemplate,
  listFeeNoticeTemplates,
  toFeeNoticeTemplate,
} from './template-store';

interface Params {
  params: Promise<{ wsId: string }>;
}

/** The active notice template (or the built-in default) and the last 20 versions. */
export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'view_invoices',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin } = access.context;

  const listed = await listFeeNoticeTemplates(sbAdmin, wsId);
  if (listed.response) return listed.response;
  const body: FeeNoticeTemplateResponse = {
    template: activeFeeNoticeTemplate(listed.versions),
    versions: listed.versions,
  };
  return NextResponse.json(body);
}

/**
 * Saves a new active version through private.fee_notice_template_save, which
 * also writes the `template_saved` event. Unknown placeholders are rejected
 * here (400) and again in SQL; a stale `expected_version` answers 409.
 */
export async function PUT(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const access = await getFeeLockRouteContext(request, rawWsId, [
    'manage_finance',
  ]);
  if (access.response) return access.response;
  const { normalizedWsId: wsId, sbAdmin, user } = access.context;

  const parsed = feeNoticeTemplateSaveRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const issues = validateFeeNoticeTemplate(input);
  if (issues.length) {
    return NextResponse.json(
      { code: FEE_NOTICE_TEMPLATE_INVALID_CODE, issues },
      { status: 400 }
    );
  }

  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('fee_notice_template_save', {
      p_ws_id: wsId,
      p_actor_id: user.id,
      p_body: input.body,
      p_item_format: input.item_format,
      p_item_separator: input.item_separator,
      p_payment_line: input.payment_line,
      p_notice_grouping: input.notice_grouping,
      p_locale: input.locale,
      p_expected_version: input.expected_version,
      p_restored_from: input.restored_from,
    });
  if (error?.code === '40001') {
    const listed = await listFeeNoticeTemplates(sbAdmin, wsId);
    return NextResponse.json(
      {
        code: FEE_NOTICE_TEMPLATE_VERSION_CONFLICT_CODE,
        current: listed.versions
          ? activeFeeNoticeTemplate(listed.versions)
          : null,
      },
      { status: 409 }
    );
  }
  if (error || !data) return feeLockErrorResponse(error);
  return NextResponse.json(toFeeNoticeTemplate(data));
}
