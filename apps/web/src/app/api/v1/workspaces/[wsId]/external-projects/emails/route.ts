import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeExternalAppRequest,
  readExternalAppCredentials,
} from '@/lib/external-projects/app-credentials';
import {
  readExternalProjectEmailBudget,
  summariseBudget,
  wouldExceedBudget,
} from '@/lib/external-projects/email-budget';
import {
  listDisallowedRecipientDomains,
  readExternalProjectEmailPolicy,
} from '@/lib/external-projects/email-policy';

/**
 * Outbound mail for linked external projects.
 *
 * External sites (Richfield forwarding contact responses, and any project bound
 * after it) previously had to carry their own third-party mail credentials.
 * This routes them through the workspace's own SES setup instead, so sending
 * inherits the platform's rate limiting, blacklist checks, and audit trail
 * rather than each satellite reinventing them — and there is one place to
 * revoke, meter, and bill.
 */

const MAX_RECIPIENTS = 5;

const emailSchema = z
  .object({
    // A satellite sends operational mail to its own operators, so the recipient
    // list is deliberately small: this is not a bulk channel.
    to: z.array(z.string().trim().pipe(z.email())).min(1).max(MAX_RECIPIENTS),
    replyTo: z
      .array(z.string().trim().pipe(z.email()))
      .max(MAX_RECIPIENTS)
      .optional(),
    subject: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(50_000).optional(),
    html: z.string().trim().min(1).max(200_000).optional(),
    entityId: z.string().trim().max(200).optional(),
    entityType: z.string().trim().max(80).optional(),
  })
  .refine((value) => Boolean(value.text || value.html), {
    message: 'Provide text or html content',
    path: ['text'],
  });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * SES requires an HTML part. Callers sending plain operational mail should not
 * have to hand-build markup, so wrap their text rather than rejecting it —
 * escaped, because the body is attacker-influenced (it can carry whatever a
 * visitor typed into a public form).
 */
function toHtmlBody(text: string) {
  return `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word">${escapeHtml(
    text
  )}</pre>`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
): Promise<NextResponse> {
  const { wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;

  try {
    const { appId, appSecret } = readExternalAppCredentials(request);
    const access = await authorizeExternalAppRequest({
      admin,
      appId,
      appSecret,
      wsId,
    });

    if (access.response) return access.response;

    const payload = emailSchema.parse(await request.json());
    const policy = readExternalProjectEmailPolicy(access.binding.settings);

    if (!policy.enabled) {
      return NextResponse.json(
        { error: 'Outbound email is not enabled for this external app' },
        { status: 403 }
      );
    }

    const disallowedDomains = listDisallowedRecipientDomains(
      payload.to,
      policy
    );
    if (disallowedDomains.length > 0) {
      return NextResponse.json(
        {
          disallowedDomains,
          error: 'One or more recipient domains are not allowed',
        },
        { status: 403 }
      );
    }
    const text = payload.text ?? null;
    const html = payload.html ?? (text ? toHtmlBody(text) : null);

    if (!html) {
      return NextResponse.json(
        { error: 'Provide text or html content' },
        { status: 400 }
      );
    }

    // Checked before the send so the cap is never exceeded, only refused. One
    // audit row is written per send regardless of recipient count, so the
    // charge for this call is a single unit.
    const budget = await readExternalProjectEmailBudget({ admin, wsId });

    if (wouldExceedBudget(budget, 1)) {
      return NextResponse.json(
        {
          budget,
          error: 'Monthly email budget exhausted for this workspace',
        },
        { status: 429 }
      );
    }

    const result = await sendWorkspaceEmail(
      wsId,
      {
        content: {
          html,
          subject: payload.subject,
          ...(payload.replyTo?.length ? { replyTo: payload.replyTo } : {}),
          ...(text ? { text } : {}),
        },
        metadata: {
          entityId: payload.entityId,
          entityType: payload.entityType ?? 'external-project-email',
          // Tagged with the calling app so the audit trail attributes every send
          // to the satellite that asked for it.
          templateType: `external-project:${access.appId}`,
        },
        recipients: { to: payload.to },
      },
      policy.useRootWorkspaceCredentials
        ? { credentialWorkspaceId: ROOT_WORKSPACE_ID }
        : undefined
    );

    if (!result.success) {
      return NextResponse.json(
        {
          blockedRecipients: result.blockedRecipients,
          error: result.error ?? 'Email send failed',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      auditId: result.auditId,
      // Echo the allowance back so the caller can surface remaining headroom
      // without needing a second endpoint.
      budget: summariseBudget(budget.sent + 1),
      messageId: result.messageId,
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { details: error.flatten(), error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    console.error('Failed to send external project email', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
