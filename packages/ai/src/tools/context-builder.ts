import type { SupabaseClient } from '@tuturuuu/supabase';
import type { PermissionId } from '@tuturuuu/types';
import type { MiraSoulConfig } from '../chat/mira-system-instruction';

/**
 * Token budget for context injection (~4K tokens ≈ 16K chars).
 * Each section is capped individually so one large section can't starve others.
 */
const MAX_CONTEXT_CHARS = 16_000;
const SECTION_CHAR_LIMITS = {
  soul: 2000,
  tasks: 4000,
  calendar: 3000,
  finance: 2000,
  memories: 3000,
  meta: 500,
} as const;

type ContextOptions = {
  userId: string;
  wsId: string;
  supabase: SupabaseClient;
  timezone?: string;
  withoutPermission?: (permission: PermissionId) => boolean;
};

export type MiraContextResult = {
  /** Combined context string for injection into the prompt. */
  contextString: string;
  /** Raw soul data for use in buildMiraSystemInstruction. */
  soul: MiraSoulConfig | null;
  /** True when no soul config row exists (brand-new user). */
  isFirstInteraction: boolean;
};

/**
 * Builds a dynamic context string injected into Mira's system prompt.
 * All data sources are fetched in parallel for performance.
 *
 * Returns the context string alongside the raw soul config so the
 * caller can pass it to `buildMiraSystemInstruction()`.
 */
export async function buildMiraContext(
  opts: ContextOptions
): Promise<MiraContextResult> {
  const { userId, wsId, supabase, timezone = 'UTC', withoutPermission } = opts;
  const canReadCalendar = !withoutPermission?.('manage_calendar');
  const canReadFinance = !withoutPermission?.('manage_finance');

  let now = new Date();
  try {
    // If a valid timezone is provided, try to shift our "now" perspective
    // to match the local calendar day for better "today" logic
    const tzDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);

    // Parse the output back (MM/DD/YYYY, HH:mm:ss) to create a local-time equivalent Date
    const [datePart, timePart] = tzDateStr.split(', ');
    const [month, day, year] = datePart!.split('/');
    const [hour, min, sec] = timePart!.split(':');
    if (year && month && day && hour && min && sec) {
      now = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(min, 10),
        parseInt(sec, 10)
      );
    }
  } catch (err) {
    console.warn(
      'Failed to parse timezone for context builder, falling back to UTC',
      err
    );
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);

  // Fetch all context sources in parallel
  const [
    soulResult,
    tasksResult,
    calendarResult,
    walletsResult,
    memoriesResult,
  ] = await Promise.all([
    // Soul config
    supabase
      .from('mira_soul')
      .select('name, tone, personality, boundaries, vibe, chat_tone')
      .eq('user_id', userId)
      .maybeSingle(),

    // Tasks: overdue + due today (via RPC)
    supabase.rpc('get_user_accessible_tasks', {
      p_user_id: userId,
      p_ws_id: wsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active'],
    }),

    // Calendar: next 7 days
    canReadCalendar
      ? supabase
          .from('workspace_calendar_events')
          .select('title, start_at, end_at, location')
          .eq('ws_id', wsId)
          .gte('start_at', now.toISOString())
          .lte('start_at', weekAhead.toISOString())
          .order('start_at', { ascending: true })
          .limit(15)
      : Promise.resolve({ data: null, error: null }),

    // Wallets with balances
    canReadFinance
      ? supabase
          .from('workspace_wallets')
          .select('name, currency, balance')
          .eq('ws_id', wsId)
          .limit(10)
      : Promise.resolve({ data: null, error: null }),

    // Recent memories (most recently referenced or updated)
    supabase
      .from('mira_memories')
      .select('key, value, category')
      .eq('user_id', userId)
      .order('last_referenced_at', { ascending: false, nullsFirst: false })
      .limit(15),
  ]);

  const sections: string[] = [];

  // ── Soul / Personality ──
  const soul = soulResult.data;
  if (soul) {
    const soulLines = [`Your name is ${soul.name || 'Mira'}.`];
    if (soul.tone) soulLines.push(`Tone: ${soul.tone}.`);
    if (soul.personality) soulLines.push(`Personality: ${soul.personality}`);
    if (soul.boundaries) soulLines.push(`Boundaries: ${soul.boundaries}`);
    if (soul.vibe) soulLines.push(`Vibe: ${soul.vibe}`);
    if (soul.chat_tone) soulLines.push(`Chat tone: ${soul.chat_tone}.`);

    sections.push(
      truncateSection(
        `## Your Identity\n${soulLines.join('\n')}`,
        SECTION_CHAR_LIMITS.soul
      )
    );
  }

  // ── Meta ──
  const formatterOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  };

  let timeStr = now.toISOString();
  let dateStr = now.toLocaleDateString('en-US');

  try {
    // Re-use real current time for the literal string output so it shows actual timezone
    const realNow = new Date();
    timeStr = realNow.toLocaleString('en-US', formatterOptions);
    dateStr = realNow.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
  } catch (_) {
    // Ignore formatting errors
  }

  const metaLines = [
    `Current time: ${timeStr} (${timezone})`,
    `Today: ${dateStr}`,
  ];
  sections.push(
    truncateSection(
      `## Context\n${metaLines.join('\n')}`,
      SECTION_CHAR_LIMITS.meta
    )
  );

  // ── Tasks ──
  type RpcTask = {
    task_id: string;
    task_name: string;
    task_priority: string | null;
    task_end_date: string | null;
    task_completed_at: string | null;
    task_closed_at: string | null;
  };

  const allTasks = (tasksResult.data || []) as RpcTask[];
  const activeTasks = allTasks.filter(
    (t) => !t.task_completed_at && !t.task_closed_at
  );

  const overdueTasks = activeTasks
    .filter((t) => t.task_end_date && t.task_end_date < now.toISOString())
    .slice(0, 10);

  const todayTasks = activeTasks
    .filter(
      (t) =>
        t.task_end_date &&
        t.task_end_date >= todayStart.toISOString() &&
        t.task_end_date <= todayEnd.toISOString()
    )
    .slice(0, 10);

  const upcomingTasks = activeTasks
    .filter(
      (t) =>
        t.task_end_date &&
        t.task_end_date > todayEnd.toISOString() &&
        t.task_end_date <= weekAhead.toISOString()
    )
    .slice(0, 5);

  if (overdueTasks.length || todayTasks.length || upcomingTasks.length) {
    const taskLines: string[] = [`Total active tasks: ${activeTasks.length}`];

    if (overdueTasks.length) {
      taskLines.push(`\nOverdue (${overdueTasks.length}):`);
      for (const t of overdueTasks) {
        taskLines.push(
          `- ${t.task_name}${t.task_priority ? ` [${t.task_priority}]` : ''} (due ${t.task_end_date})`
        );
      }
    }

    if (todayTasks.length) {
      taskLines.push(`\nDue today (${todayTasks.length}):`);
      for (const t of todayTasks) {
        taskLines.push(
          `- ${t.task_name}${t.task_priority ? ` [${t.task_priority}]` : ''}`
        );
      }
    }

    if (upcomingTasks.length) {
      taskLines.push(`\nUpcoming this week (${upcomingTasks.length}):`);
      for (const t of upcomingTasks) {
        taskLines.push(`- ${t.task_name} (due ${t.task_end_date})`);
      }
    }

    sections.push(
      truncateSection(
        `## Tasks\n${taskLines.join('\n')}`,
        SECTION_CHAR_LIMITS.tasks
      )
    );
  }

  // ── Calendar ──
  const events = calendarResult.data;
  if (events?.length) {
    const eventLines: string[] = [];
    for (const e of events) {
      const start = new Date(e.start_at);
      const end = new Date(e.end_at);

      let dateStr: string, timeStr: string;
      try {
        dateStr = start.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          timeZone: timezone,
        });
        timeStr = `${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone })}–${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone })}`;
      } catch (_) {
        dateStr = start.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        timeStr = `${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      }
      const loc = e.location ? ` @ ${e.location}` : '';
      eventLines.push(`- ${dateStr} ${timeStr}: ${e.title}${loc}`);
    }

    sections.push(
      truncateSection(
        `## Calendar (next 7 days)\n${eventLines.join('\n')}`,
        SECTION_CHAR_LIMITS.calendar
      )
    );
  }

  // ── Finance ──
  const wallets = walletsResult.data;
  if (wallets?.length) {
    const walletLines = wallets.map(
      (w: { name: string | null; balance: number | null; currency: string }) =>
        `- ${w.name || 'Wallet'}: ${w.balance ?? 0} ${w.currency}`
    );

    sections.push(
      truncateSection(
        `## Wallets\n${walletLines.join('\n')}`,
        SECTION_CHAR_LIMITS.finance
      )
    );
  }

  // ── Memories ──
  const memories = memoriesResult.data;
  if (memories?.length) {
    const memLines = memories.map(
      (m: { category: string; key: string; value: string }) =>
        `- [${m.category}] ${m.key}: ${m.value}`
    );

    sections.push(
      truncateSection(
        `## User Memories\n${memLines.join('\n')}`,
        SECTION_CHAR_LIMITS.memories
      )
    );
  }

  // Combine all sections, respecting total budget
  let combined = sections.join('\n\n');
  if (combined.length > MAX_CONTEXT_CHARS) {
    combined = `${combined.slice(0, MAX_CONTEXT_CHARS)}\n[context truncated]`;
  }

  return {
    contextString: combined,
    soul: soul
      ? {
          name: soul.name ?? undefined,
          tone: soul.tone,
          personality: soul.personality,
          boundaries: soul.boundaries,
          vibe: soul.vibe,
          chat_tone: soul.chat_tone,
        }
      : null,
    isFirstInteraction: !soul,
  };
}

/** Truncate a section to a char limit, adding an ellipsis marker */
function truncateSection(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20)}\n[...truncated]`;
}
