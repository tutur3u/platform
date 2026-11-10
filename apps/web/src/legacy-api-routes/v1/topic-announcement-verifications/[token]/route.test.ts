import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock(
  '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared',
  () => ({ getPrivateSchemaClient: vi.fn() })
);
vi.mock('@/lib/topic-announcements-email', () => ({
  htmlEscape: (value: string) => value,
}));
vi.mock('@/lib/topic-announcements-verification', () => ({
  hashTopicAnnouncementVerificationToken: vi.fn(),
}));

const { GET } = await import('./route');

describe('topic announcement verification page', () => {
  it('serves its static HTML under its own strict policy', async () => {
    const response = await GET(new Request('https://tuturuuu.com/x'), {
      params: Promise.resolve({ token: '' }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('text/html');
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('script-src');
  });
});
