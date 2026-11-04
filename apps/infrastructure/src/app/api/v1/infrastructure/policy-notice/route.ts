import { NextResponse } from 'next/server';
import { getPolicyNoticeOperator } from '@/lib/policy-notice/authorization';
import { PolicyNoticeError } from '@/lib/policy-notice/errors';
import { createPolicyNoticeDeps } from '@/lib/policy-notice/runtime';
import { runPolicyNotice } from '@/lib/policy-notice/sender';

// One invocation sends a bounded batch inside its time budget; call again
// until the result reports done.
export const maxDuration = 300;

const CLIENT_ERRORS = new Set(['invalid_request', 'confirm_required']);

/**
 * Staff-only trigger for the policy-change notice. Body (all optional):
 * { mode: 'dry_run' | 'test_list' | 'live', confirm, testRecipients, limits }.
 * Dry run is the default. Responses carry counts, never addresses.
 */
export async function POST(request: Request) {
  const operator = await getPolicyNoticeOperator(request);
  if (!operator)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body: unknown = await request.json().catch(() => ({}));
  try {
    const result = await runPolicyNotice(
      body,
      operator.id,
      createPolicyNoticeDeps(operator.admin)
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PolicyNoticeError) {
      return NextResponse.json(
        { error: error.code },
        { status: CLIENT_ERRORS.has(error.code) ? 400 : 409 }
      );
    }
    console.error('[PolicyNotice] Run failed', {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
