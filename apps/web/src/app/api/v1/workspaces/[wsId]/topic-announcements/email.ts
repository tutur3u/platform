import {
  EmailService,
  type RateLimitConfig,
  sendWorkspaceEmail,
} from '@tuturuuu/email-service';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  buildTopicAnnouncementVerificationUrl,
  generateVerificationToken,
  hashVerificationToken,
  type TopicAnnouncementsSupabaseClient,
} from './shared';

const VERIFICATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 15 * 60 * 1000;
const TOPIC_VERIFICATION_RATE_LIMITS = {
  invitePerDay: 200,
  invitePerHour: 30,
  invitePerMinute: 5,
  ipPerHour: 40,
  ipPerMinute: 5,
  recipientPerDay: 4,
  recipientPerHour: 2,
  userPerHour: 20,
  userPerMinute: 3,
  workspacePerDay: 200,
  workspacePerHour: 30,
  workspacePerMinute: 5,
} satisfies Partial<RateLimitConfig>;

export function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderVerificationEmail({
  contactName,
  verificationUrl,
}: {
  contactName: string;
  verificationUrl: string;
}) {
  const safeName = htmlEscape(contactName);
  const safeUrl = htmlEscape(verificationUrl);
  return {
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827"><p>Hello ${safeName},</p><p>Please verify this email address before it can receive Topic Announcements from Tuturuuu workspaces.</p><p><a href="${safeUrl}" style="display:inline-block;border-radius:6px;background:#111827;color:#ffffff;padding:10px 14px;text-decoration:none">Verify email address</a></p><p>If the button does not work, open this link:</p><p><a href="${safeUrl}">${safeUrl}</a></p><p>This verification link expires in 7 days. If you did not expect this email, you can ignore it.</p></div>`,
    subject: 'Verify your email for Topic Announcements',
    text: `Hello ${contactName},\n\nPlease verify this email address before it can receive Topic Announcements from Tuturuuu workspaces.\n\nVerify: ${verificationUrl}\n\nThis verification link expires in 7 days.`,
  };
}

export function renderAnnouncementEmail({
  announcement,
  workspaceName,
}: {
  announcement: {
    body: string;
    class_label: string | null;
    day_label: string | null;
    place: string | null;
    room: string | null;
    session_date: string | null;
    start_time: string | null;
    title: string;
    topic: string;
  };
  workspaceName: string | null;
}) {
  const details = [
    ['Class', announcement.class_label],
    ['Date', announcement.session_date],
    ['Day', announcement.day_label],
    ['Time', announcement.start_time],
    ['Room', announcement.room],
    ['Place', announcement.place],
  ].filter(([, value]) => Boolean(value));
  const detailHtml = details
    .map(
      ([label, value]) =>
        `<li><strong>${htmlEscape(label ?? '')}:</strong> ${htmlEscape(value ?? '')}</li>`
    )
    .join('');
  const detailText = details
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  const body = announcement.body || announcement.topic;

  return {
    html: `<p>Hello,</p><p>${htmlEscape(body).replaceAll('\n', '<br />')}</p>${detailHtml ? `<ul>${detailHtml}</ul>` : ''}<p>Sent by ${htmlEscape(workspaceName || 'Tuturuuu')}</p>`,
    subject: announcement.title,
    text: `Hello,\n\n${body}\n\n${detailText ? `${detailText}\n\n` : ''}Sent by ${workspaceName || 'Tuturuuu'}`,
  };
}

export async function getContactVerificationStatuses(
  sbAdmin: TopicAnnouncementsSupabaseClient,
  contactIds: string[]
) {
  const uniqueIds = [...new Set(contactIds)];
  const statuses = new Map<
    string,
    'linked_confirmed_account' | 'verified' | 'pending' | 'needs_verification'
  >();

  for (const contactId of uniqueIds) {
    statuses.set(contactId, 'needs_verification');
  }
  if (uniqueIds.length === 0) return statuses;

  const now = new Date().toISOString();
  const { data: verifications, error } = await sbAdmin
    .from('topic_announcement_contact_verifications')
    .select('contact_id,status,expires_at')
    .in('contact_id', uniqueIds)
    .in('status', ['pending', 'verified'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  for (const row of verifications ?? []) {
    if (row.status === 'verified') {
      statuses.set(row.contact_id, 'verified');
    } else if (
      statuses.get(row.contact_id) === 'needs_verification' &&
      row.expires_at > now
    ) {
      statuses.set(row.contact_id, 'pending');
    }
  }

  for (const contactId of uniqueIds) {
    const { data, error: rpcError } = await sbAdmin.rpc(
      'topic_announcement_contact_has_linked_verified_email',
      { p_contact_id: contactId }
    );
    if (rpcError) throw rpcError;
    if (data) statuses.set(contactId, 'linked_confirmed_account');
  }

  return statuses;
}

export async function sendTopicAnnouncement({
  actorUserId,
  announcementId,
  normalizedWsId,
  request,
  resend,
  sbAdmin,
}: {
  actorUserId: string;
  announcementId: string;
  normalizedWsId: string;
  request: Request;
  resend: boolean;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  const { data: announcement, error: announcementError } = await sbAdmin
    .from('topic_announcements')
    .select('*')
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();

  if (announcementError) throw announcementError;
  if (!announcement) return { error: 'ANNOUNCEMENT_NOT_FOUND', status: 404 };
  if (announcement.status === 'sent' && !resend) {
    return { error: 'ALREADY_SENT', status: 409 };
  }

  const { data: recipientRows, error: recipientsError } = await sbAdmin
    .from('topic_announcement_recipients')
    .select('contact_id, contact:topic_announcement_contacts(*)')
    .eq('announcement_id', announcementId);

  if (recipientsError) throw recipientsError;

  const contacts = (recipientRows ?? [])
    .map((row: any) => row.contact)
    .filter(Boolean);
  if (contacts.length === 0) return { error: 'NO_RECIPIENTS', status: 409 };

  const statuses = await getContactVerificationStatuses(
    sbAdmin,
    contacts.map((contact: any) => contact.id)
  );
  const unverified = contacts.filter((contact: any) => {
    const status = statuses.get(contact.id);
    return status !== 'verified' && status !== 'linked_confirmed_account';
  });

  if (unverified.length > 0) {
    await sbAdmin
      .from('topic_announcements')
      .update({
        last_error: `EMAIL_NOT_VERIFIED: ${unverified.map((contact: any) => contact.email).join(', ')}`,
        status: 'skipped',
        updated_by: actorUserId,
      })
      .eq('id', announcementId)
      .eq('ws_id', normalizedWsId);
    return { error: 'EMAIL_NOT_VERIFIED', status: 409 };
  }

  const { data: workspace } = await sbAdmin
    .from('workspaces')
    .select('name')
    .eq('id', normalizedWsId)
    .maybeSingle();
  const result = await sendWorkspaceEmail(normalizedWsId, {
    content: renderAnnouncementEmail({
      announcement,
      workspaceName: workspace?.name ?? null,
    }),
    metadata: {
      entityId: announcementId,
      entityType: 'topic_announcement',
      ipAddress: extractIPFromHeaders(request.headers),
      templateType: 'topic-announcement',
      userAgent: request.headers.get('user-agent') ?? undefined,
      userId: actorUserId,
    },
    recipients: { to: contacts.map((contact: any) => contact.email) },
  });

  if (!result.success) {
    await sbAdmin
      .from('topic_announcements')
      .update({
        last_error: result.error ?? 'Failed to send topic announcement',
        status: 'failed',
        updated_by: actorUserId,
      })
      .eq('id', announcementId)
      .eq('ws_id', normalizedWsId);
    return { error: result.error ?? 'SEND_FAILED', status: 502 };
  }

  await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: null,
      sent_at: new Date().toISOString(),
      sent_email_audit_id: result.auditId ?? null,
      status: 'sent',
      updated_by: actorUserId,
    })
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId);

  return {
    auditId: result.auditId ?? null,
    messageId: result.messageId ?? null,
  };
}

export async function sendTopicVerificationEmail({
  contact,
  normalizedWsId,
  request,
  sbAdmin,
  userId,
}: {
  contact: { email: string; id: string; name: string };
  normalizedWsId: string;
  request: Request;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  userId: string;
}) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: pendingVerification, error: pendingError } = await sbAdmin
    .from('topic_announcement_contact_verifications')
    .select('id,created_at,expires_at')
    .eq('contact_id', contact.id)
    .eq('email', contact.email)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingError) throw pendingError;

  if (pendingVerification) {
    const createdAt = new Date(pendingVerification.created_at).getTime();

    if (
      Number.isFinite(createdAt) &&
      createdAt > now - VERIFICATION_RESEND_COOLDOWN_MS
    ) {
      return {
        alreadyPending: true,
        expiresAt: pendingVerification.expires_at,
      };
    }
  }

  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expiresAt = new Date(now + VERIFICATION_TOKEN_TTL_MS).toISOString();

  await sbAdmin
    .from('topic_announcement_contact_verifications')
    .update({ status: 'revoked' })
    .eq('contact_id', contact.id)
    .eq('email', contact.email)
    .eq('status', 'pending');

  const { error: insertError } = await sbAdmin
    .from('topic_announcement_contact_verifications')
    .insert({
      contact_id: contact.id,
      email: contact.email,
      expires_at: expiresAt,
      requested_by: userId,
      status: 'pending',
      token_hash: tokenHash,
      ws_id: normalizedWsId,
    });
  if (insertError) throw insertError;

  const verificationUrl = buildTopicAnnouncementVerificationUrl(token);
  const verificationEmailService = await EmailService.fromWorkspace(
    ROOT_WORKSPACE_ID,
    {
      rateLimits: TOPIC_VERIFICATION_RATE_LIMITS,
    }
  );
  const result = await verificationEmailService.send({
    content: renderVerificationEmail({
      contactName: contact.name,
      verificationUrl,
    }),
    metadata: {
      entityId: contact.id,
      entityType: 'topic_announcement_contact',
      ipAddress: extractIPFromHeaders(request.headers),
      isInvite: true,
      templateType: 'topic-announcement-contact-verification',
      userAgent: request.headers.get('user-agent') ?? undefined,
      userId,
      wsId: normalizedWsId,
    },
    recipients: { to: [contact.email] },
  });

  if (!result.success) {
    await sbAdmin
      .from('topic_announcement_contact_verifications')
      .update({ status: 'revoked' })
      .eq('token_hash', tokenHash);
    serverLogger.error('Failed to send topic announcement verification email', {
      contactId: contact.id,
      error: result.error,
      wsId: normalizedWsId,
    });
    if (result.rateLimitInfo && !result.rateLimitInfo.allowed) {
      return {
        error: result.error ?? 'RATE_LIMITED',
        retryAfter: result.rateLimitInfo.retryAfter,
        status: 429,
      };
    }
    return { error: result.error ?? 'SEND_FAILED', status: 502 };
  }

  return { alreadyPending: false, expiresAt };
}
