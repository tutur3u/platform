import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { htmlEscape } from '@/lib/topic-announcements-email';
import { hashTopicAnnouncementVerificationToken } from '@/lib/topic-announcements-verification';

interface Params {
  params: Promise<{ token: string }>;
}

function htmlPage(
  title: string,
  message: string,
  {
    status = 200,
    tone = 'neutral',
  }: {
    status?: number;
    tone?: 'error' | 'neutral' | 'success' | 'warning';
  } = {}
) {
  const toneLabel = {
    error: 'Action needed',
    neutral: 'Verification',
    success: 'Verified',
    warning: 'Expired',
  }[tone];
  const escapedTitle = htmlEscape(title);
  const escapedMessage = htmlEscape(message);
  const escapedTone = htmlEscape(toneLabel);

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapedTitle}</title><style>:root{color-scheme:light dark}body{margin:0;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{min-height:100vh;display:grid;place-items:center;padding:32px 20px}.shell{width:min(100%,680px);border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.08);overflow:hidden}.bar{height:6px;background:#0f172a}.content{padding:32px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}.icon{display:grid;place-items:center;width:48px;height:48px;border-radius:999px;margin-bottom:20px;background:#f1f5f9;color:#0f172a;font-weight:800}h1{margin:8px 0 12px;font-size:clamp(28px,5vw,40px);line-height:1.05;letter-spacing:-.02em}p{margin:0;color:#475569;font-size:16px;line-height:1.7}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}a{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid #0f172a;background:#0f172a;color:#fff;padding:10px 14px;font-weight:650;text-decoration:none}.secondary{background:#fff;color:#0f172a}@media (prefers-color-scheme:dark){body{background:#020617;color:#f8fafc}.shell{border-color:#1e293b;background:#0f172a}.bar{background:#f8fafc}.eyebrow,p{color:#cbd5e1}.icon{background:#1e293b;color:#f8fafc}a{border-color:#f8fafc;background:#f8fafc;color:#020617}.secondary{background:#0f172a;color:#f8fafc}}</style></head><body><main><section class="shell"><div class="bar"></div><div class="content"><div class="icon">OK</div><div class="eyebrow">${escapedTone}</div><h1>${escapedTitle}</h1><p>${escapedMessage}</p><div class="actions"><a href="https://tuturuuu.com">Open Tuturuuu</a><a class="secondary" href="mailto:support@tuturuuu.com">Contact support</a></div></div></section></main></body></html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status,
    }
  );
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!token) {
    return htmlPage(
      'Invalid verification link',
      'The verification token is missing.',
      { status: 400, tone: 'error' }
    );
  }

  const sbAdmin = (await createAdminClient()) as any;
  const tokenHash = hashTopicAnnouncementVerificationToken(token);
  const { data, error } = await sbAdmin
    .from('topic_announcement_contact_verifications')
    .select('id,expires_at,status')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to load topic announcement verification token', {
      error,
    });
    return htmlPage(
      'Verification failed',
      'We could not verify this email address. Please request a new verification link.',
      { status: 500, tone: 'error' }
    );
  }

  if (data?.status !== 'pending') {
    return htmlPage(
      'Verification link unavailable',
      'This verification link is invalid or has already been used.',
      { status: 404, tone: 'error' }
    );
  }

  if (data.expires_at < new Date().toISOString()) {
    await sbAdmin
      .from('topic_announcement_contact_verifications')
      .update({ status: 'expired' })
      .eq('id', data.id);
    return htmlPage(
      'Verification link expired',
      'Please request a new Topic Announcements verification email.',
      { status: 410, tone: 'warning' }
    );
  }

  const { error: updateError } = await sbAdmin
    .from('topic_announcement_contact_verifications')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', data.id);

  if (updateError) {
    serverLogger.error('Failed to verify topic announcement contact email', {
      error: updateError,
      verificationId: data.id,
    });
    return htmlPage(
      'Verification failed',
      'We could not verify this email address. Please request a new verification link.',
      { status: 500, tone: 'error' }
    );
  }

  return htmlPage(
    'Email verified',
    'This email address can now receive Topic Announcements from enabled Tuturuuu workspaces.',
    { tone: 'success' }
  );
}
