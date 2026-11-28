import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  lookup: vi.fn(),
  generate: vi.fn(),
  record: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: '2026-11-28',
  lookupAiDataConsent: mocks.lookup,
}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('./transcript-roster', () => ({ readTranscriptRoster: vi.fn() }));
vi.mock('./credit-admission', () => ({ admitMeetCredits: vi.fn() }));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: vi.fn(),
}));
vi.mock('./transcript-fence', () => ({
  requireMeetTranscriptFence: vi.fn(),
  recordMeetTranscriptSession: mocks.record,
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: vi.fn() }));
// Authorization is covered separately; avoid loading built auth packages here.
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  meetNotesSchema: { parse: (value: unknown) => value },
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { meetAiResponse } from './access';
import {
  meetTranscriptAiConsent,
  requireMeetTranscriptAiConsent,
} from './ai-data-consent';
import { transcribeMeetChunk } from './chunks';
import { changeMeetAi } from './sessions';

const id = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
const nativeHeaders = { Authorization: 'Bearer native.supabase.jwt' };
const action = (body: Record<string, unknown>, native = true) =>
  new Request('https://meet.example.test/api/meet-ai/test', {
    method: 'POST',
    headers: native ? nativeHeaders : {},
    body: JSON.stringify(body),
  });

function bindDb(results: unknown[]) {
  const writes: unknown[] = [];
  const from = vi.fn(() => {
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    for (const key of ['select', 'eq', 'in', 'order', 'range', 'insert'])
      chain[key] = () => chain;
    chain.update = (value: unknown) => {
      writes.push(value);
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(result);
    chain.single = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(result).then(resolve);
    return chain;
  });
  mocks.access.mockResolvedValue({
    db: { from },
    meetingId: id,
    wsId: id,
    user: { id },
    canManage: true,
  });
  return { from, writes };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue(false);
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only');
});

describe('requireMeetTranscriptAiConsent', () => {
  it('refuses a native caller without consent', async () => {
    await expect(
      requireMeetTranscriptAiConsent(action({}), id)
    ).rejects.toMatchObject({ status: 403, code: 'ai_consent_required' });
    expect(mocks.lookup).toHaveBeenCalledWith(id, undefined);
  });

  it('passes a consented native caller and never looks up a browser', async () => {
    mocks.lookup.mockResolvedValue(true);
    await expect(
      requireMeetTranscriptAiConsent(action({}), id)
    ).resolves.toBeUndefined();
    mocks.lookup.mockClear();
    await expect(
      requireMeetTranscriptAiConsent(action({}, false), id)
    ).resolves.toBeUndefined();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});

describe('Meet AI transcription routes', () => {
  it.each(['start', 'draft'])(
    'refuses a native %s without consent before any session work',
    async (name) => {
      const { from } = bindDb([]);
      const request = action({ action: name, sessionId: id });
      const response = await meetAiResponse(() =>
        changeMeetAi(request, params, meetTranscriptAiConsent(request))
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'ai_consent_required',
      });
      expect(from).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
    }
  );

  it('stops capture on a native finish but refuses notes without consent', async () => {
    const session = { id, notes_status: 'pending', ended_at: null };
    const { from, writes } = bindDb([
      { data: session, error: null },
      { data: null, error: null },
    ]);
    const request = action({ action: 'finish', sessionId: id });
    const response = await meetAiResponse(() =>
      changeMeetAi(request, params, meetTranscriptAiConsent(request))
    );
    expect(response.status).toBe(403);
    expect(writes).toEqual([{ ended_at: expect.any(String) }]);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: id, active: false })
    );
    expect(from).toHaveBeenCalledTimes(2);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('refuses a native audio chunk without consent before transcription', async () => {
    const { from } = bindDb([]);
    const body = new FormData();
    body.set('sessionId', id);
    body.set('id', id);
    body.set('sequence', '0');
    body.set('startSeconds', '0');
    body.set('audio', new Blob([new Uint8Array(64)], { type: 'audio/wav' }));
    const request = new Request('https://meet.example.test/api/chunks', {
      method: 'POST',
      headers: nativeHeaders,
      body,
    });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(request, params, meetTranscriptAiConsent(request))
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'ai_consent_required',
    });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
