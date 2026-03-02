import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { MiraToolContext } from '../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';
import {
  decryptEventsForTools,
  encryptEventFieldsForTools,
  getWorkspaceKeyForTools,
} from './helpers/encryption';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function executeGetUpcomingEvents(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const days = (args.num_days as number) || (args.days as number) || 7;
  const tz = ctx.timezone;
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  // Build the query window in the user's timezone so "today" means their
  // full calendar day, not "from this UTC instant forward".
  let rangeStart: dayjs.Dayjs;
  let rangeEnd: dayjs.Dayjs;

  if (tz) {
    try {
      rangeStart = dayjs().tz(tz).startOf('day');
      rangeEnd = rangeStart.add(days, 'day').endOf('day');
    } catch (_) {
      console.warn(`Invalid timezone ${tz}, falling back to UTC`);
      rangeStart = dayjs.utc().startOf('day');
      rangeEnd = rangeStart.add(days, 'day').endOf('day');
    }
  } else {
    rangeStart = dayjs.utc().startOf('day');
    rangeEnd = rangeStart.add(days, 'day').endOf('day');
  }

  const { data: events, error } = await ctx.supabase
    .from('workspace_calendar_events')
    .select('id, title, description, start_at, end_at, location, is_encrypted')
    .eq('ws_id', workspaceId)
    .gte('start_at', rangeStart.toISOString())
    .lte('start_at', rangeEnd.toISOString())
    .order('start_at', { ascending: true })
    .limit(50);

  if (error) return { error: error.message };
  if (!events?.length) return { count: 0, events: [] };

  const decrypted = await decryptEventsForTools(events, workspaceId);

  // Format dates in the user's timezone so the model presents local times
  const formatInTz = (iso: string) => {
    if (!tz) return iso;
    try {
      return dayjs(iso).tz(tz).format('YYYY-MM-DDTHH:mm:ssZ');
    } catch {
      return iso;
    }
  };

  return {
    count: decrypted.length,
    timezone: tz ?? 'UTC',
    events: decrypted.map(
      (e: {
        id: string;
        title: string;
        description?: string;
        start_at: string;
        end_at: string;
        location: string | null;
      }) => ({
        id: e.id,
        title: e.title,
        description: e.description || null,
        start: formatInTz(e.start_at),
        end: formatInTz(e.end_at),
        location: e.location,
      })
    ),
  };
}

export async function executeCreateEvent(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const title = args.title as string;
  const description = (args.description as string) ?? '';
  const location = (args.location as string) ?? null;

  // Convert standard ISO strings or casual strings into proper UTC timestamps
  // based on the provided timezone, assuming the LLM provides dates in the local timezone context.
  let startAt = args.startAt as string;
  let endAt = args.endAt as string;

  if (ctx.timezone) {
    try {
      // If the model gave an ISO string without Z, treat it as local to the timezone
      const startDayjs = startAt.includes('Z')
        ? dayjs(startAt)
        : dayjs.tz(startAt, ctx.timezone);
      const endDayjs = endAt.includes('Z')
        ? dayjs(endAt)
        : dayjs.tz(endAt, ctx.timezone);

      startAt = startDayjs.toISOString();
      endAt = endDayjs.toISOString();
    } catch (err) {
      console.warn(
        'Failed to parse timezone dates, falling back to basic parsing',
        err
      );
      // Fallback to basic Date parsing if timezone plugin fails
      startAt = new Date(args.startAt as string).toISOString();
      endAt = new Date(args.endAt as string).toISOString();
    }
  } else {
    startAt = new Date(args.startAt as string).toISOString();
    endAt = new Date(args.endAt as string).toISOString();
  }

  const encrypted = await encryptEventFieldsForTools(
    { title, description, location },
    workspaceId
  );

  const { data: event, error } = await ctx.supabase
    .from('workspace_calendar_events')
    .insert({
      title: encrypted.title,
      start_at: startAt,
      end_at: endAt,
      description: encrypted.description,
      location: encrypted.location,
      ws_id: workspaceId,
      is_encrypted: encrypted.is_encrypted,
    })
    .select('id, title, start_at, end_at')
    .single();

  if (error) return { error: error.message };

  return {
    success: true,
    message: `Event "${title}" created`,
    event: encrypted.is_encrypted
      ? { ...event, title, description, location }
      : event,
  };
}

export async function executeUpdateEvent(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const eventId = args.eventId as string;
  const title = args.title as string | undefined;
  const description = args.description as string | undefined;
  const location = args.location as string | undefined;
  let startAt = args.startAt as string | undefined;
  let endAt = args.endAt as string | undefined;

  // Convert dates if provided
  if (startAt || endAt) {
    if (ctx.timezone) {
      try {
        if (startAt) {
          const startDayjs = startAt.includes('Z')
            ? dayjs(startAt)
            : dayjs.tz(startAt, ctx.timezone);
          startAt = startDayjs.toISOString();
        }
        if (endAt) {
          const endDayjs = endAt.includes('Z')
            ? dayjs(endAt)
            : dayjs.tz(endAt, ctx.timezone);
          endAt = endDayjs.toISOString();
        }
      } catch (err) {
        console.warn(
          'Failed to parse timezone dates for update, falling back',
          err
        );
        if (startAt) startAt = new Date(startAt).toISOString();
        if (endAt) endAt = new Date(endAt).toISOString();
      }
    } else {
      if (startAt) startAt = new Date(startAt).toISOString();
      if (endAt) endAt = new Date(endAt).toISOString();
    }
  }

  // Get existing event to check encryption status
  const { data: existingEvent, error: fetchError } = await ctx.supabase
    .from('workspace_calendar_events')
    .select('is_encrypted')
    .eq('id', eventId)
    .eq('ws_id', workspaceId)
    .single();

  if (fetchError || !existingEvent) {
    return { error: fetchError?.message || 'Event not found' };
  }

  const updates: Record<string, any> = {};
  if (startAt) updates.start_at = startAt;
  if (endAt) updates.end_at = endAt;

  if (
    title !== undefined ||
    description !== undefined ||
    location !== undefined
  ) {
    const fieldsToEncrypt = {
      title: title ?? '', // Ensure fallback if undefined but we need to encrypt
      description: description ?? '',
      location: location ?? null,
    };

    // We only encrypt the fields that were actually provided to be updated,
    // but the helper expects the full object. We will merge carefully.
    const encrypted = await encryptEventFieldsForTools(
      fieldsToEncrypt,
      workspaceId
    );

    if (title !== undefined) updates.title = encrypted.title;
    if (description !== undefined) updates.description = encrypted.description;
    if (location !== undefined) updates.location = encrypted.location;
    updates.is_encrypted = encrypted.is_encrypted;
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await ctx.supabase
    .from('workspace_calendar_events')
    .update(updates)
    .eq('id', eventId)
    .eq('ws_id', workspaceId);

  if (error) return { error: error.message };

  return {
    success: true,
    message: `Event updated successfully`,
  };
}

export async function executeDeleteEvent(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const eventId = args.eventId as string;

  const { error } = await ctx.supabase
    .from('workspace_calendar_events')
    .delete()
    .eq('id', eventId)
    .eq('ws_id', workspaceId);

  if (error) return { error: error.message };

  return {
    success: true,
    message: `Event deleted successfully`,
  };
}

// ── E2EE Management ──

export async function executeCheckE2EEStatus(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  const key = await getWorkspaceKeyForTools(workspaceId);
  const hasKey = key !== null;

  if (!hasKey) {
    return {
      enabled: false,
      hasKey: false,
      message:
        'End-to-end encryption is not enabled for this workspace. Calendar events are stored in plaintext.',
    };
  }

  const { count, error } = await ctx.supabase
    .from('workspace_calendar_events')
    .select('id', { count: 'exact', head: true })
    .eq('ws_id', workspaceId)
    .eq('is_encrypted', false);

  return {
    enabled: true,
    hasKey: true,
    unencryptedCount: error ? -1 : (count ?? 0),
    message:
      count && count > 0
        ? `E2EE is enabled but ${count} event(s) are still unencrypted.`
        : 'E2EE is enabled. All calendar events are encrypted.',
  };
}

export async function executeEnableE2EE(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);
  try {
    const {
      isEncryptionEnabled,
      getMasterKey,
      encryptWorkspaceKey,
      generateWorkspaceKey,
    } = await import('@tuturuuu/utils/encryption');

    if (!isEncryptionEnabled()) {
      return {
        success: false,
        error:
          'Encryption is not configured on this server. Please contact an administrator.',
      };
    }

    // Check if key already exists
    const existingKey = await getWorkspaceKeyForTools(workspaceId);
    if (existingKey) {
      return {
        success: true,
        message: 'E2EE is already enabled for this workspace.',
        alreadyEnabled: true,
      };
    }

    const masterKey = getMasterKey();
    const newKey = generateWorkspaceKey();
    const encryptedKey = await encryptWorkspaceKey(newKey, masterKey);

    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const sbAdmin = await createAdminClient();

    const { error } = await sbAdmin.from('workspace_encryption_keys').insert({
      ws_id: workspaceId,
      encrypted_key: encryptedKey,
    } as never);

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      message:
        'E2EE has been enabled. New calendar events will be encrypted automatically.',
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to enable E2EE: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
