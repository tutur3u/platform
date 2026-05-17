import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { htmlEscape } from '../../workspaces/[wsId]/topic-announcements/email';
import { hashVerificationToken } from '../../workspaces/[wsId]/topic-announcements/shared';

interface Params {
  params: Promise<{ token: string }>;
}

function htmlPage(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title></head><body><main style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;"><h1>${htmlEscape(title)}</h1><p>${htmlEscape(message)}</p></main></body></html>`,
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
      400
    );
  }

  const sbAdmin = (await createAdminClient()) as any;
  const tokenHash = hashVerificationToken(token);
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
      500
    );
  }

  if (!data || data.status !== 'pending') {
    return htmlPage(
      'Verification link unavailable',
      'This verification link is invalid or has already been used.',
      404
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
      410
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
      500
    );
  }

  return htmlPage(
    'Email verified',
    'This email address can now receive Topic Announcements from enabled Tuturuuu workspaces.'
  );
}
