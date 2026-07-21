import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  type EmailUnsubscribeTokenClaims,
  verifyEmailUnsubscribeToken,
} from '@/lib/email-unsubscribe';
import {
  cancelPendingPostEmailsForRecipientEmail,
  POST_EMAIL_UNSUBSCRIBED_RECIPIENT_REASON,
} from '@/lib/post-email-queue';

const UNSUBSCRIBE_REASON = 'recipient_unsubscribed';

function htmlResponse(body: string, init?: ResponseInit) {
  return new NextResponse(body, {
    ...init,
    headers: {
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...init?.headers,
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPage({
  email,
  message,
  token,
  title,
}: {
  email?: string;
  message: string;
  token?: string;
  title: string;
}) {
  const escapedEmail = email ? escapeHtml(email) : '';
  const escapedMessage = escapeHtml(message);
  const escapedTitle = escapeHtml(title);
  const escapedToken = token ? escapeHtml(token) : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { width: min(100%, 440px); border: 1px solid #e2e8f0; border-radius: 8px; background: white; padding: 28px; box-shadow: 0 12px 30px rgb(15 23 42 / 0.08); }
      h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.2; }
      p { margin: 0 0 18px; color: #475569; line-height: 1.55; }
      .email { color: #0f172a; font-weight: 600; overflow-wrap: anywhere; }
      button { border: 0; border-radius: 6px; background: #0f172a; color: white; cursor: pointer; font: inherit; font-weight: 600; padding: 10px 14px; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapedTitle}</h1>
        <p>${escapedMessage}${escapedEmail ? ` <span class="email">${escapedEmail}</span>` : ''}</p>
        ${
          escapedToken
            ? `<form method="post"><input type="hidden" name="token" value="${escapedToken}" /><button type="submit">Unsubscribe</button></form>`
            : ''
        }
      </section>
    </main>
  </body>
</html>`;
}

function verifyRequestToken(token: string | null) {
  if (!token) {
    return { error: 'missing_token' as const, ok: false as const };
  }

  return verifyEmailUnsubscribeToken(token);
}

async function readPostToken(request: NextRequest) {
  const queryToken = request.nextUrl.searchParams.get('token');
  if (queryToken) return queryToken;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    return typeof body?.token === 'string' ? body.token : null;
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData().catch(() => null);
    const formToken = form?.get('token');
    return typeof formToken === 'string' ? formToken : null;
  }

  return null;
}

async function unsubscribeEmail(
  sbAdmin: TypedSupabaseClient,
  claims: EmailUnsubscribeTokenClaims
) {
  const { error } = await sbAdmin.from('email_blacklist').upsert(
    {
      entry_type: 'email',
      value: claims.email,
      reason: UNSUBSCRIBE_REASON,
      added_by_user_id: null,
    },
    {
      onConflict: 'entry_type,value',
    }
  );

  if (error) throw error;

  return cancelPendingPostEmailsForRecipientEmail(sbAdmin, {
    email: claims.email,
    reason: POST_EMAIL_UNSUBSCRIBED_RECIPIENT_REASON,
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const verification = verifyRequestToken(token);

  if (!verification.ok) {
    return htmlResponse(
      renderPage({
        title: 'Invalid unsubscribe link',
        message: 'This unsubscribe link is invalid or incomplete.',
      }),
      { status: 400 }
    );
  }

  return htmlResponse(
    renderPage({
      email: verification.claims.email,
      message:
        'Confirm that you want to stop receiving Tuturuuu system emails at',
      title: 'Unsubscribe from Tuturuuu emails',
      token: token ?? undefined,
    })
  );
}

export async function POST(request: NextRequest) {
  const token = await readPostToken(request);
  const verification = verifyRequestToken(token);

  if (!verification.ok) {
    return NextResponse.json(
      { message: 'Invalid unsubscribe link' },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const cancelledPostEmails = await unsubscribeEmail(
      sbAdmin,
      verification.claims
    );

    if (request.headers.get('accept')?.includes('text/html')) {
      return htmlResponse(
        renderPage({
          email: verification.claims.email,
          message: 'You have been unsubscribed from Tuturuuu system emails at',
          title: 'Unsubscribed',
        })
      );
    }

    return NextResponse.json({
      message: 'Unsubscribed',
      cancelledPostEmails,
    });
  } catch (error) {
    console.error('Failed to unsubscribe email recipient', {
      error,
    });
    return NextResponse.json(
      { message: 'Unable to unsubscribe right now' },
      { status: 500 }
    );
  }
}
