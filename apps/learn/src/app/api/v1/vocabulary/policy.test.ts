import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  error: '',
  provider: vi.fn(),
  credits: vi.fn(),
  birthDate: '2012-01-01',
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: f.credits,
  deductAiCredits: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => database(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, {
        supabase: database(),
        user: { id: 'synthetic-learner' },
      }),
}));
function database() {
  return {
    from: (table: string) => {
      const result = () => {
        if (f.error === table)
          return { data: null, error: new Error('synthetic lookup failure') };
        if (table === 'user_private_details')
          return {
            data: { default_workspace_id: 'personal', birthday: f.birthDate },
            error: null,
          };
        if (table === 'workspaces')
          return {
            data: {
              id: 'personal',
              personal: true,
              creator_id: 'synthetic-learner',
            },
            error: null,
          };
        if (table === 'workspace_members')
          return { data: [{ ws_id: 'education' }], error: null };
        if (table === 'workspace_secrets')
          return {
            data: [
              { ws_id: 'education', name: 'AI_ENABLED', value: 'true' },
              { ws_id: 'education', name: 'ENABLE_EDUCATION', value: 'true' },
              {
                ws_id: 'education',
                name: 'AI_EDUCATION_SCOPE',
                value: 'learner-data-only',
              },
            ],
            error: null,
          };
        return { data: [], error: null };
      };
      const query = Object.assign(Promise.resolve(result()), {
        select: () => query,
        eq: () => query,
        in: () => query,
        limit: () => query,
        maybeSingle: async () => result(),
      });
      return query;
    },
  };
}

import { POST as pronunciation } from './pronunciation/route';
import { POST as speech } from './speech/route';

beforeEach(() => {
  vi.clearAllMocks();
  f.error = '';
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic-key');
  vi.stubGlobal('fetch', f.provider);
});
for (const [name, handler, body] of [
  ['speech', speech, { text: 'hello', kind: 'word' }],
  [
    'pronunciation',
    pronunciation,
    { audioData: 'YXVkaW8=', targetText: 'hello', mimeType: 'audio/webm' },
  ],
] as const) {
  const request = () =>
    new NextRequest(`https://synthetic.test/${name}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  it(`${name} denies an under-18 education learner before credits/provider`, async () => {
    expect((await handler(request())).status).toBe(403);
    expect(f.credits).not.toHaveBeenCalled();
    expect(f.provider).not.toHaveBeenCalled();
  });
  it(`${name} fails closed on workspace resolution errors`, async () => {
    f.error = 'user_private_details';
    await expect(handler(request())).rejects.toThrow(
      'AI policy workspace unavailable'
    );
    expect(f.credits).not.toHaveBeenCalled();
    expect(f.provider).not.toHaveBeenCalled();
  });
  it(`${name} fails closed on education policy lookup errors`, async () => {
    f.error = 'workspace_secrets';
    expect((await handler(request())).status).toBe(403);
    expect(f.credits).not.toHaveBeenCalled();
    expect(f.provider).not.toHaveBeenCalled();
  });
}
