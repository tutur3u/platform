import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { MiraToolContext } from '../../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../../workspace-context';

dayjs.extend(utc);
dayjs.extend(timezone);

export const MIN_DURATION_SECONDS = 60;
const ENABLE_APPROVAL_BYPASS_CHECK = false;

export type ToolFailure = {
  success: false;
  error: string;
  errorCode: string;
  retryable: boolean;
};

function parseDateOnly(
  value: unknown,
  fieldName: string
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `${fieldName} is required` };
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { ok: false, error: `${fieldName} must use YYYY-MM-DD format` };
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, error: `${fieldName} must be a valid date` };
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false, error: `${fieldName} must be a valid date` };
  }

  return { ok: true, value: trimmed };
}

export function parseFlexibleDateTime(
  value: unknown,
  fieldName: string,
  options?: { date?: unknown; timezone?: string }
): { ok: true; value: Date } | { ok: false; error: string } {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true, value };
  }

  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `${fieldName} is required` };
  }

  const resolvedTimezone =
    typeof options?.timezone === 'string' &&
    options.timezone.trim().length > 0 &&
    isValidIanaTimezone(options.timezone.trim())
      ? options.timezone.trim()
      : null;

  const parseNaiveDateTime = (input: string): Date | null => {
    if (resolvedTimezone) {
      const tzParsed = dayjs.tz(input, resolvedTimezone);
      if (tzParsed.isValid()) {
        return tzParsed.toDate();
      }
    } else {
      const utcParsed = dayjs.utc(input);
      if (utcParsed.isValid()) {
        return utcParsed.toDate();
      }
    }

    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const trimmed = value.trim();
  const isoDateTimeMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(?:Z|[+-][01]\d:[0-5]\d)?$/
  );
  if (isoDateTimeMatch) {
    const [, datePart] = isoDateTimeMatch;
    const dateParsed = parseDateOnly(datePart, fieldName);
    if (!dateParsed.ok) {
      return { ok: false, error: dateParsed.error };
    }

    const hasExplicitOffset = /(?:Z|[+-][01]\d:[0-5]\d)$/i.test(trimmed);
    const parsed = hasExplicitOffset
      ? new Date(trimmed)
      : parseNaiveDateTime(trimmed);

    if (parsed && !Number.isNaN(parsed.getTime())) {
      return { ok: true, value: parsed };
    }
  }

  const dateTimeWithSpaceMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );
  if (dateTimeWithSpaceMatch) {
    const [, datePart, hours, minutes, seconds = '00'] = dateTimeWithSpaceMatch;
    const dateParsed = parseDateOnly(datePart, fieldName);
    if (!dateParsed.ok) {
      return { ok: false, error: dateParsed.error };
    }

    const combined = parseNaiveDateTime(
      `${datePart}T${hours}:${minutes}:${seconds}`
    );
    if (combined) {
      return { ok: true, value: combined };
    }
  }

  const timeOnlyMatch = trimmed.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );
  if (timeOnlyMatch) {
    const dateParsed = parseDateOnly(options?.date, 'date');
    if (!dateParsed.ok) {
      return {
        ok: false,
        error: `${fieldName} must be a valid ISO datetime, or HH:mm/HH:mm:ss when date is provided in YYYY-MM-DD format`,
      };
    }

    const [, hours, minutes, seconds = '00'] = timeOnlyMatch;
    const combined = parseNaiveDateTime(
      `${dateParsed.value}T${hours}:${minutes}:${seconds}`
    );
    if (combined) {
      return { ok: true, value: combined };
    }
  }

  return {
    ok: false,
    error:
      `${fieldName} must be a valid ISO datetime, YYYY-MM-DD HH:mm, ` +
      `or HH:mm/HH:mm:ss when date is provided in YYYY-MM-DD format`,
  };
}

export function normalizeCursor(cursor: unknown):
  | {
      ok: true;
      lastStartTime: string;
      lastId: string;
    }
  | {
      ok: false;
      error: string;
    } {
  if (typeof cursor !== 'string' || !cursor.includes('|')) {
    return { ok: false, error: 'Invalid cursor format' };
  }

  const [lastStartTime, lastId] = cursor.split('|');
  if (!lastStartTime || !lastId) {
    return { ok: false, error: 'Invalid cursor format' };
  }

  return { ok: true, lastStartTime, lastId };
}

export function coerceOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : fallback;
}

export function buildToolFailure(
  errorCode: string,
  message: string,
  retryable: boolean
): ToolFailure {
  return {
    success: false,
    error: message,
    errorCode,
    retryable,
  };
}

export function isValidIanaTimezone(value: string): boolean {
  try {
    // RangeError for invalid IANA timezone names.
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(
  argsTimezone: unknown,
  contextTimezone: string | undefined
): {
  requested: string | null;
  resolved: string;
  usedFallback: boolean;
  validRequested: boolean;
} {
  const requestedRaw =
    typeof argsTimezone === 'string' && argsTimezone.trim().length > 0
      ? argsTimezone.trim()
      : null;

  if (requestedRaw && isValidIanaTimezone(requestedRaw)) {
    return {
      requested: requestedRaw,
      resolved: requestedRaw,
      usedFallback: false,
      validRequested: true,
    };
  }

  const contextTz =
    typeof contextTimezone === 'string' && contextTimezone.trim().length > 0
      ? contextTimezone.trim()
      : null;

  if (contextTz && isValidIanaTimezone(contextTz)) {
    return {
      requested: requestedRaw,
      resolved: contextTz,
      usedFallback: true,
      validRequested: requestedRaw === null,
    };
  }

  return {
    requested: requestedRaw,
    resolved: 'UTC',
    usedFallback: true,
    validRequested: requestedRaw === null,
  };
}


async function hasBypassApprovalPermission(
  ctx: MiraToolContext,
): Promise<boolean> {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);  

  const { data: workspace, error: workspaceError } = await ctx.supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw new Error(workspaceError.message);
  }

  if (workspace?.creator_id === ctx.userId) return true;

  const { data: defaults, error: defaultsError } = await ctx.supabase
    .from('workspace_default_permissions')
    .select('permission')
    .eq('ws_id', workspaceId)
    .eq('enabled', true)
    .eq('permission', 'bypass_time_tracking_request_approval')
    .limit(1);

  if (defaultsError) {
    throw new Error(defaultsError.message);
  }

  if (defaults?.length) return true;

  const { data: rolePermissions, error: rolePermissionsError } =
    await ctx.supabase
      .from('workspace_role_members')
      .select(
        'workspace_roles!inner(ws_id, workspace_role_permissions(permission, enabled))'
      )
      .eq('user_id', ctx.userId)
      .eq('workspace_roles.ws_id', workspaceId);

  if (rolePermissionsError) {
    throw new Error(rolePermissionsError.message);
  }

  if (!rolePermissions?.length) return false;

  return rolePermissions.some((membership) =>
    (membership.workspace_roles?.workspace_role_permissions || []).some(
      (permission) =>
        permission.enabled &&
        permission.permission === 'bypass_time_tracking_request_approval'
    )
  );
}

export async function shouldRequireApproval(
  startTime: Date,
  ctx: MiraToolContext,
): Promise<{ requiresApproval: boolean; reason?: string }> {
  const workspaceId = getWorkspaceContextWorkspaceId(ctx);

  const { data: settings, error } = await ctx.supabase
    .from('workspace_settings')
    .select('missed_entry_date_threshold')
    .eq('ws_id', workspaceId)
    .maybeSingle();

  if (error) {
    return { requiresApproval: true };
  }

  const rawThresholdDays = settings?.missed_entry_date_threshold;
  if (rawThresholdDays === null || rawThresholdDays === undefined) {
    return { requiresApproval: false };
  }

  const thresholdDays = Number(rawThresholdDays);
  if (!Number.isFinite(thresholdDays) || thresholdDays < 0) {
    return { requiresApproval: false };
  }

  if (ENABLE_APPROVAL_BYPASS_CHECK) {
    let bypassAllowed = false;
    try {
      bypassAllowed = await hasBypassApprovalPermission(ctx);
    } catch {
      return { requiresApproval: true };
    }
    if (bypassAllowed) return { requiresApproval: false };
  }

  if (thresholdDays === 0) {
    return {
      requiresApproval: true,
      reason: 'Workspace requires approval for all missed entries.',
    };
  }

  const thresholdAgo = new Date();
  thresholdAgo.setDate(thresholdAgo.getDate() - thresholdDays);

  if (startTime < thresholdAgo) {
    return {
      requiresApproval: true,
      reason: `Entry is older than ${thresholdDays} day${thresholdDays === 1 ? '' : 's'} threshold.`,
    };
  }

  return { requiresApproval: false };
}

