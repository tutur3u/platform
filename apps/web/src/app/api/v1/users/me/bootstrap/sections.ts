import type {
  BootstrapConfigId,
  BootstrapSection,
  BootstrapSectionError,
} from '@tuturuuu/internal-api/user-bootstrap';
import {
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
  WorkspaceNotFoundError,
} from '@tuturuuu/utils/workspace-helper';
import { readUserConfigs } from '@/lib/current-user/configs';
import type {
  CurrentUserReadContext,
  SectionOutcome,
} from '@/lib/current-user/context';
import { readHiddenWorkspaceIds } from '@/lib/current-user/hidden-workspaces';
import { readPendingInvitations } from '@/lib/current-user/invitations';
import { readOnboardingProgress } from '@/lib/current-user/onboarding';
import { readCurrentUserProfile } from '@/lib/current-user/profile';
import { readWorkspaceForUser } from '@/lib/current-user/workspace';
import { readWorkspaceSummaries } from '@/lib/current-user/workspace-list';
import { countUnreadNotifications } from '@/lib/notifications/unread-count';
import { timeServerPhase } from '@/lib/server-timing';
import type { BootstrapRequest } from './params';

/** Per-section deadline. Tune it from the per-section Server-Timing data. */
export const BOOTSTRAP_SECTION_DEADLINE_MS = 1200;

export type SectionResult =
  | { data: unknown; ok: true }
  | { error: BootstrapSectionError; ok: false };

/** Requested sections only; `configs` maps each requested id to a result. */
export type BootstrapSections = Record<string, unknown>;

const TIMEOUT: BootstrapSectionError = { code: 'timeout', status: 504 };
const FAILED: BootstrapSectionError = { code: 'failed', status: 500 };
const WORKSPACE_UNAVAILABLE: BootstrapSectionError = {
  code: 'workspace_unavailable',
  status: 404,
};

type Guarded<T> =
  | { error: BootstrapSectionError; kind: 'error' }
  | { kind: 'value'; value: T };

/**
 * Runs one read under the section deadline. A throw or a timeout becomes an
 * error value, so no section can fail another. Sections only read: a read that
 * loses the race is abandoned, never left as a write in flight.
 */
async function guarded<T>(run: () => Promise<T>): Promise<Guarded<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), BOOTSTRAP_SECTION_DEADLINE_MS);
  });
  const work = run();
  // The loser of the race must not surface as an unhandled rejection.
  work.catch(() => {});
  try {
    const winner = await Promise.race([work, deadline]);
    if (winner === 'timeout') return { error: TIMEOUT, kind: 'error' };
    return { kind: 'value', value: winner };
  } catch {
    return { error: FAILED, kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

export function outcomeToSection(outcome: SectionOutcome): SectionResult {
  if (outcome.status >= 200 && outcome.status < 300) {
    return { data: outcome.body, ok: true };
  }
  const code =
    outcome.status === 403
      ? 'forbidden'
      : outcome.status === 404
        ? 'not_found'
        : 'failed';
  return { error: { code, status: outcome.status }, ok: false };
}

function toSection(result: Guarded<SectionOutcome | SectionResult>) {
  if (result.kind === 'error')
    return { error: result.error, ok: false } as const;
  const value = result.value;
  return 'ok' in value ? value : outcomeToSection(value);
}

async function readWorkspaceSection(
  ctx: CurrentUserReadContext,
  wsId: string
): Promise<SectionResult> {
  let normalized: string;
  try {
    normalized = await normalizeWorkspaceId(wsId, ctx.supabase);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return { error: WORKSPACE_UNAVAILABLE, ok: false };
    }
    throw error;
  }
  // An unresolved handle is not an id: answer as for a missing workspace
  // instead of letting the lookup fail on the uuid cast.
  if (!isWorkspaceUuidLiteral(normalized)) {
    return { error: WORKSPACE_UNAVAILABLE, ok: false };
  }

  const outcome = await readWorkspaceForUser(ctx, normalized);
  return outcome.unavailable
    ? { error: WORKSPACE_UNAVAILABLE, ok: false }
    : outcomeToSection(outcome);
}

/** Runs each requested section concurrently; results never depend on order. */
export async function runBootstrapSections(
  ctx: Omit<CurrentUserReadContext, 'db'>,
  request: BootstrapRequest
): Promise<BootstrapSections> {
  // Concurrent sections would sum to more than the wall time as `db`, so the
  // per-section phases carry the timing instead.
  const readCtx: CurrentUserReadContext = {
    ...ctx,
    db: async (run) => await run(),
  };
  const sections: Record<string, unknown> = {};

  const runners: Record<BootstrapSection, () => Promise<void>> = {
    profile: async () => {
      sections.profile = toSection(
        await guarded(() => readCurrentUserProfile(readCtx))
      );
    },
    workspace: async () => {
      sections.workspace = toSection(
        await guarded(() => readWorkspaceSection(readCtx, request.wsId ?? ''))
      );
    },
    configs: async () => {
      const result = await guarded(() =>
        readUserConfigs(readCtx, request.configs)
      );
      const configs: Partial<Record<BootstrapConfigId, SectionResult>> = {};
      for (const id of request.configs) {
        configs[id] =
          result.kind === 'error'
            ? { error: result.error, ok: false }
            : outcomeToSection(result.value[id] ?? { body: null, status: 500 });
      }
      sections.configs = configs;
    },
    onboarding: async () => {
      sections.onboarding = toSection(
        await guarded(() => readOnboardingProgress(readCtx))
      );
    },
    unreadCount: async () => {
      sections.unreadCount = toSection(
        await guarded(() => countUnreadNotifications(ctx, request.unreadWsId))
      );
    },
    invitations: async () => {
      sections.invitations = toSection(
        await guarded(() => readPendingInvitations(ctx))
      );
    },
    hiddenWorkspaces: async () => {
      sections.hiddenWorkspaces = toSection(
        await guarded(() => readHiddenWorkspaceIds(readCtx))
      );
    },
    workspaces: async () => {
      sections.workspaces = toSection(
        await guarded(() => readWorkspaceSummaries(ctx))
      );
    },
  };

  await Promise.all(
    request.sections.map((section) =>
      timeServerPhase(`s-${section}`, runners[section])
    )
  );
  logSectionFailures(sections);
  return sections;
}

/** Logs codes only, never bodies, ids or emails. */
function logSectionFailures(sections: Record<string, unknown>) {
  const failures: string[] = [];
  const visit = (name: string, value: unknown) => {
    const result = value as SectionResult;
    if (result && 'ok' in result && !result.ok) {
      failures.push(`${name}:${result.error.code}`);
    }
  };
  for (const [name, value] of Object.entries(sections)) {
    if (name === 'configs') {
      for (const [id, entry] of Object.entries(
        value as Record<string, unknown>
      )) {
        visit(`configs.${id}`, entry);
      }
    } else {
      visit(name, value);
    }
  }
  if (failures.length > 0) {
    console.error('[user-bootstrap] section failures', failures);
  }
}
