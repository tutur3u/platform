/**
 * Test double used by `vi.mock('@/lib/app-coordination/external-app-bearer')`:
 * every bearer's app is live and grants `external-projects:manage` by name.
 */
export async function requireLiveExternalApp() {
  return {
    app: { allowedScopes: ['external-projects:manage'] },
    ok: true as const,
  };
}

export async function rejectStaleExternalAppBearer() {
  return null;
}
