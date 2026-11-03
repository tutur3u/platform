export type AiDataScope = 'learner-data' | 'teacher-authored' | 'unknown';
export type WorkspaceAiPolicy = {
  enabled: string | undefined;
  education: boolean;
  scope: string | undefined;
};

export function evaluateWorkspaceAiPolicy(
  policy: WorkspaceAiPolicy,
  data: AiDataScope
): boolean {
  if (policy.enabled !== undefined && policy.enabled !== 'true') return false;
  const scope = policy.scope ?? 'full';
  if (scope !== 'full' && scope !== 'learner-data-only') return false;
  if (!policy.education) return true;
  return scope === 'learner-data-only' && data === 'teacher-authored';
}

export async function runWorkspaceAiFeature<T>(
  allowed: () => Promise<boolean>,
  feature: () => Promise<T>
): Promise<{ allowed: false } | { allowed: true; value: T }> {
  try {
    if (!(await allowed())) return { allowed: false };
  } catch {
    return { allowed: false };
  }
  return { allowed: true, value: await feature() };
}

export const WORKSPACE_AI_DISABLED = 'WORKSPACE_AI_DISABLED';
export function workspaceAiRefusal(locale = 'en') {
  return Response.json(
    {
      code: WORKSPACE_AI_DISABLED,
      error: locale.startsWith('vi')
        ? 'AI đã bị tắt theo chính sách của không gian làm việc.'
        : 'AI is disabled by workspace policy.',
    },
    { status: 403 }
  );
}
