/** Deployment-owned mapping; neither request headers nor user metadata grant access. */
export type ExternalProjectAdminMapping = {
  origin: string;
  workspaceId: string;
  canonicalProjectId: string;
};

export const EXTERNAL_PROJECT_ADMIN_PATHS = {
  admin: '/admin',
  analytics: '/admin/analytics',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
}

export function resolveExternalProjectAdminMapping(
  raw: string | undefined,
  origin: string
): ExternalProjectAdminMapping | null {
  if (!raw || !isOrigin(origin)) return null;
  try {
    const mappings: unknown = JSON.parse(raw);
    if (!Array.isArray(mappings) || mappings.length > 100) return null;
    const valid = mappings.every(
      (entry) =>
        isRecord(entry) &&
        isOrigin(entry.origin) &&
        typeof entry.workspaceId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          entry.workspaceId
        ) &&
        typeof entry.canonicalProjectId === 'string' &&
        /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(entry.canonicalProjectId)
    );
    if (!valid) return null;
    const matches = (mappings as ExternalProjectAdminMapping[]).filter(
      (entry) => entry.origin === origin
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Apply site identity to the result of the central CMS/Web gate. */
export function externalProjectAdminBindingMatches({
  mapping,
  binding,
  workspaceId,
}: {
  mapping: ExternalProjectAdminMapping;
  binding: {
    enabled: boolean;
    workspace_id: string;
    canonical_id: string | null;
    canonical_project: { id: string; is_active: boolean } | null;
  };
  workspaceId: string;
}) {
  return (
    workspaceId === mapping.workspaceId &&
    binding.workspace_id === mapping.workspaceId &&
    binding.enabled &&
    binding.canonical_id === mapping.canonicalProjectId &&
    binding.canonical_project?.id === mapping.canonicalProjectId &&
    binding.canonical_project.is_active === true
  );
}
