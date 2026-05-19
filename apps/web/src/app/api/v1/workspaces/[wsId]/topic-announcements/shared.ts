import { createHash, randomBytes } from 'node:crypto';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import {
  getPermissions,
  getSecret,
  getSecrets,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@/lib/topic-announcements';

const EMAIL_SCHEMA = z.string().trim().email().transform(normalizeEmail);
const OPTIONAL_TEXT_SCHEMA = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const TopicAnnouncementStatusSchema = z.enum([
  'draft',
  'queued',
  'sent',
  'failed',
  'skipped',
  'cancelled',
]);

export const TopicAnnouncementListQuerySchema = z.object({
  contactId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).default(''),
  status: z
    .union([TopicAnnouncementStatusSchema, z.literal('all')])
    .default('all'),
});

export const TopicAnnouncementContactSchema = z.object({
  archived: z.boolean().optional(),
  email: EMAIL_SCHEMA,
  metadata: z.record(z.string(), z.unknown()).default({}),
  name: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  workspaceUserId: z.string().uuid().nullable().optional(),
});

export const TopicAnnouncementPayloadSchema = z.object({
  body: z.string().trim().max(20_000).default(''),
  classLabel: OPTIONAL_TEXT_SCHEMA,
  contactIds: z.array(z.string().uuid()).min(1).max(50),
  dayLabel: OPTIONAL_TEXT_SCHEMA,
  groupId: z.string().uuid().nullable().optional(),
  place: OPTIONAL_TEXT_SCHEMA,
  room: OPTIONAL_TEXT_SCHEMA,
  sessionDate: z.string().date().nullable().optional(),
  sourceType: z.string().trim().min(1).max(80).default('manual'),
  startTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}(?::\d{2})?$/u)
    .nullable()
    .optional(),
  status: TopicAnnouncementStatusSchema.optional(),
  title: z.string().trim().min(1).max(300),
  topic: z.string().trim().min(1).max(20_000),
});

export const TopicAnnouncementImportSchema = z.object({
  rows: z
    .array(
      z.object({
        classLabel: z.string().trim().optional(),
        contactEmail: EMAIL_SCHEMA.optional(),
        contactName: z.string().trim().optional(),
        dayLabel: z.string().trim().optional(),
        place: z.string().trim().optional(),
        room: z.string().trim().optional(),
        sessionDate: z.string().date().optional(),
        startTime: z.string().trim().optional(),
        title: z.string().trim().optional(),
        topic: z.string().trim().optional(),
      })
    )
    .min(1)
    .max(500),
  sourceName: z.string().trim().max(200).optional(),
  sourceType: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .default('foreign_teacher_schedule'),
});

export const TopicAnnouncementSendSchema = z.object({
  resend: z.boolean().default(false),
});

export const TopicAnnouncementBulkSendSchema = z.object({
  announcementIds: z.array(z.string().uuid()).min(1).max(50),
  resend: z.boolean().default(false),
});

export interface TopicAnnouncementsAccessContext {
  actorUserId: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  supabase: TopicAnnouncementsSupabaseClient;
}

export type TopicAnnouncementsSupabaseClient = any;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateVerificationToken() {
  return randomBytes(32).toString('base64url');
}

const TOPIC_ANNOUNCEMENT_VERIFICATION_FALLBACK_ORIGIN = 'https://tuturuuu.com';

function isLocalVerificationOrigin(value: string) {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    );
  } catch {
    return true;
  }
}

function resolveVerificationOriginCandidate(value?: string | null) {
  if (!value?.trim()) return null;

  const resolved = resolveInternalAppUrl({
    appName: 'platform',
    candidates: [value],
    fallback: '',
  });

  return resolved || null;
}

export function getTopicAnnouncementVerificationOrigin() {
  const explicitOrigin = resolveVerificationOriginCandidate(
    process.env.TOPIC_ANNOUNCEMENT_VERIFICATION_ORIGIN
  );

  if (explicitOrigin) {
    return explicitOrigin;
  }

  for (const candidate of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
  ]) {
    const resolved = resolveVerificationOriginCandidate(candidate);

    if (resolved && !isLocalVerificationOrigin(resolved)) {
      return resolved;
    }
  }

  return TOPIC_ANNOUNCEMENT_VERIFICATION_FALLBACK_ORIGIN;
}

export function buildTopicAnnouncementVerificationUrl(token: string) {
  return `${getTopicAnnouncementVerificationOrigin()}/api/v1/topic-announcement-verifications/${encodeURIComponent(token)}`;
}

export async function resolveTopicAnnouncementsAccess(
  request: Request,
  wsId: string,
  {
    requireManage = false,
    requireSend = false,
  }: {
    requireManage?: boolean;
    requireSend?: boolean;
  } = {}
): Promise<
  | { context: TopicAnnouncementsAccessContext; response?: never }
  | { context?: never; response: NextResponse }
> {
  const supabase = (await createClient(
    request
  )) as TopicAnnouncementsSupabaseClient;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({ request, wsId: normalizedWsId });

  if (!permissions) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const secrets = await getSecrets({ forceAdmin: true, wsId: normalizedWsId });
  const enabled =
    getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value === 'true';
  if (!enabled) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const sbAdmin =
    (await createAdminClient()) as TopicAnnouncementsSupabaseClient;
  const { data: workspace, error: workspaceError } = await sbAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', normalizedWsId)
    .maybeSingle();
  if (workspaceError || !workspace || workspace.personal) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (requireManage && permissions.withoutPermission('manage_users')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  if (
    requireSend &&
    (permissions.withoutPermission('manage_users') ||
      permissions.withoutPermission('send_user_group_post_emails'))
  ) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    context: {
      actorUserId: user.id,
      normalizedWsId,
      sbAdmin,
      supabase,
    },
  };
}
