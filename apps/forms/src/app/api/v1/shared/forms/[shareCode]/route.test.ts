import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestFormDefinition,
  createTestFormSection,
} from '@/features/forms/test-support/form-fixtures';
import type { FormDefinition } from '@/features/forms/types';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  definition: vi.fn(),
  rpc: vi.fn(),
  existing: vi.fn(),
  turnstile: vi.fn(),
  user: vi.fn(),
  copy: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/cloudflare/turnstile/server', () => ({
  isTurnstileError: () => false,
  verifyTurnstileToken: mocks.turnstile,
}));
vi.mock('@/features/forms/response-copy-email', () => ({
  getAuthenticatedUserContext: mocks.user,
  maybeSendResponseCopyEmail: mocks.copy,
}));
vi.mock('@/features/forms/shared-form-loader', () => ({
  loadSharedFormSnapshot: vi.fn(),
}));
vi.mock('@/features/forms/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/forms/server')>()),
  fetchFormDefinition: mocks.definition,
}));

import { POST } from './route';

const FORM_ID = '50000000-0000-0000-0000-000000000001';
const WS_ID = '50000000-0000-0000-0000-000000000002';
const SHARE_ID = '50000000-0000-0000-0000-000000000010';
const SECTION_ID = '50000000-0000-0000-0000-000000000020';
const QUESTION_ID = '50000000-0000-0000-0000-000000000030';
const USER_ID = '50000000-0000-0000-0000-000000000040';
const UPDATED_AT = '2026-11-20T00:00:00.000Z';
const session = (n: number) =>
  `50000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;

let form: Record<string, unknown>;
let sessions: Map<string, string | null>;

function definition(settings: Partial<FormDefinition['settings']> = {}) {
  const base = createTestFormDefinition();
  return createTestFormDefinition({
    settings: { ...base.settings, ...settings },
    sections: [
      createTestFormSection({
        id: SECTION_ID,
        questions: [
          {
            id: QUESTION_ID,
            sectionId: SECTION_ID,
            type: 'short_text',
            title: '<p>Name</p>',
            description: '',
            required: true,
            image: { storagePath: '', url: '', alt: '' },
            settings: {},
            options: [],
          },
        ],
      }),
    ],
  });
}

function single(data: unknown) {
  const query = {
    eq: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

// Only reads are allowed: every write must go through the transaction RPC.
const formsClient = {
  from(table: string) {
    return {
      select(columns: string) {
        if (table === 'form_share_links')
          return single({ id: SHARE_ID, form_id: FORM_ID, active: true });
        if (table === 'forms') return single(form);
        if (table === 'form_sessions') {
          let id = '';
          const query = {
            eq: (column: string, value: string) => {
              if (column === 'id') id = value;
              return query;
            },
            maybeSingle: async () => ({
              data: sessions.has(id)
                ? { id, submitted_at: sessions.get(id) }
                : null,
              error: null,
            }),
          };
          return query;
        }
        if (table === 'form_responses' && columns === 'id') {
          const query = {
            eq: () => query,
            limit: () => query,
            maybeSingle: mocks.existing,
          };
          return query;
        }
        throw new Error(`Unexpected read of ${table}`);
      },
    };
  },
};

const adminClient = { schema: () => formsClient, rpc: mocks.rpc };

function submit(sessionId: string, answer = 'Ada') {
  return POST(
    new NextRequest('https://forms.test/api/v1/shared/forms/share', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        answers: { [QUESTION_ID]: answer },
      }),
    }),
    { params: Promise.resolve({ shareCode: 'share' }) }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  form = {
    id: FORM_ID,
    ws_id: WS_ID,
    title: 'Survey',
    status: 'published',
    access_mode: 'anonymous',
    open_at: null,
    close_at: null,
    max_responses: null,
    updated_at: UPDATED_AT,
  };
  sessions = new Map([1, 2, 3, 4, 5].map((n) => [session(n), null]));
  mocks.admin.mockResolvedValue(adminClient);
  mocks.definition.mockResolvedValue(definition());
  mocks.user.mockResolvedValue({ user: null, authenticatedEmail: null });
  mocks.existing.mockResolvedValue({ data: null, error: null });
});

describe('shared form submission', () => {
  it('commits the response, answers and session in one transaction', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        kind: 'submitted',
        response_id: 'response-1',
        submitted_at: '2026-11-23T01:02:03.456789+00:00',
        replayed: false,
      },
      error: null,
    });

    const response = await submit(session(1));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      responseId: 'response-1',
      responseCopyRequested: false,
      responseCopyStatus: null,
      responseCopySentTo: null,
    });
    expect(mocks.turnstile).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('commit_form_response', {
      p_submission: {
        ws_id: WS_ID,
        form_id: FORM_ID,
        share_link_id: SHARE_ID,
        session_id: session(1),
        commitment: expect.stringMatching(/^[0-9a-f]{64}$/),
        policy_revision: UPDATED_AT,
        proof: 'verified',
        access_mode: 'anonymous',
        respondent_user_id: null,
        respondent_email: null,
        snapshot_open_at: null,
        snapshot_close_at: null,
        snapshot_max_responses: null,
        last_section_id: SECTION_ID,
        metadata: {},
        answers: [
          {
            question_id: QUESTION_ID,
            question_title: 'Name',
            question_type: 'short_text',
            answer_text: 'Ada',
            answer_json: null,
          },
        ],
      },
    });
  });

  it('accepts only the response limit under concurrent submissions', async () => {
    form.max_responses = 2;
    let stored = 0;
    let lock = Promise.resolve();
    // Serializes like the form row lock the transaction takes before counting.
    mocks.rpc.mockImplementation(async () => {
      const turn = lock;
      let release = () => {};
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await turn;
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        if (stored >= 2) return { data: { kind: 'limit' }, error: null };
        stored += 1;
        return {
          data: {
            kind: 'submitted',
            response_id: `response-${stored}`,
            submitted_at: UPDATED_AT,
            replayed: false,
          },
          error: null,
        };
      } finally {
        release();
      }
    });

    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => submit(session(n)))
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([
      201, 201, 409, 409, 409,
    ]);
    expect(stored).toBe(2);
    for (const response of responses.filter(({ status }) => status === 409))
      expect(await response.json()).toEqual({
        error: 'This form has reached its response limit',
      });
    expect(mocks.rpc).toHaveBeenCalledTimes(5);
  });

  it('names the one-response rule when the respondent already answered', async () => {
    form.access_mode = 'authenticated';
    mocks.definition.mockResolvedValue(
      definition({ oneResponsePerUser: true })
    );
    mocks.user.mockResolvedValue({
      user: { id: USER_ID },
      authenticatedEmail: 'ada@example.com',
    });
    mocks.rpc.mockResolvedValue({ data: { kind: 'limit' }, error: null });
    mocks.existing.mockResolvedValue({
      data: { id: 'response-0' },
      error: null,
    });

    const response = await submit(session(1));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Only one response is allowed for this form',
    });
    expect(mocks.rpc.mock.calls[0]?.[1].p_submission).toMatchObject({
      respondent_user_id: USER_ID,
      respondent_email: null,
      access_mode: 'authenticated',
    });
  });

  it.each([
    [
      {
        kind: 'submitted',
        response_id: 'r',
        submitted_at: UPDATED_AT,
        replayed: true,
      },
      409,
      'This session has already been submitted',
    ],
    [{ kind: 'conflict' }, 409, 'This session has already been submitted'],
    [{ kind: 'closed' }, 410, 'This form is not currently accepting responses'],
    [{ kind: 'not_found' }, 404, 'Session not found'],
    [{ kind: 'invalid' }, 400, 'Invalid response payload'],
    [
      { kind: 'policy_changed' },
      409,
      'This form changed while you were responding. Reload it and submit again',
    ],
  ])('maps %j to %i', async (data, status, error) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    const response = await submit(session(1));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('fails closed when the transaction reply is missing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    const response = await submit(session(1));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'timeout' });
  });

  it('keeps the submitted-session check before the transaction', async () => {
    sessions.set(session(1), UPDATED_AT);

    const response = await submit(session(1));

    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
