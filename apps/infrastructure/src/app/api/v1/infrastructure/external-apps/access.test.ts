import { describe, expect, it, vi } from 'vitest';

const authorizeInfrastructureAdminRequest = vi.fn();

vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest,
}));

describe('external app registry access', () => {
  it('uses the satellite session and accepts either registry permission', async () => {
    authorizeInfrastructureAdminRequest.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' },
    });
    const { requireExternalAppRegistryAdmin } = await import('./access');

    const result = await requireExternalAppRegistryAdmin(
      new Request('https://infrastructure.tuturuuu.com/api')
    );

    expect(result.ok).toBe(true);
    expect(authorizeInfrastructureAdminRequest).toHaveBeenCalledWith([
      'manage_workspace_secrets',
      'manage_workspace_roles',
    ]);
  });
});
