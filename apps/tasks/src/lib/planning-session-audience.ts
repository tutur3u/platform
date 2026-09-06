import type { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';

type SessionOptions = NonNullable<
  Parameters<typeof verifyAppSessionRequest>[1]
>;

/** Calendar embeds the Tasks UI and uses its own signed session for Tasks APIs. */
export function withPlanningSessionAudience(
  options: SessionOptions
): SessionOptions {
  const targets =
    typeof options.targetApp === 'string'
      ? [options.targetApp]
      : options.targetApp;

  if (!targets?.includes('tasks') || targets.includes('calendar')) {
    return options;
  }

  return { ...options, targetApp: [...targets, 'calendar'] };
}
