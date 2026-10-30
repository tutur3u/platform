import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';
import { MEET_CONSENT_NOTICE_VERSION } from '../consent/notice';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  generate: vi.fn(),
  speaker: vi.fn(),
  audience: vi.fn(),
}));
vi.mock('server-only', () => ({}));
// Authorization is covered separately; avoid loading built auth packages here.
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: async () => ({}) }));
vi.mock('./transcript-speaker', () => ({
  resolveTranscriptSpeaker: mocks.speaker,
  readTranscriptionAudience: mocks.audience,
}));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';

const host = '00000000-0000-4000-8000-000000000001';
const guest = '00000000-0000-4000-8000-000000000002';
const decliner = '00000000-0000-4000-8000-000000000003';
const stale = '00000000-0000-4000-8000-000000000004';
const bystander = '00000000-0000-4000-8000-000000000005';
const params = { params: Promise.resolve({ wsId: host, meetingId: host }) };
const started = new Date(Date.now() - 60_000).toISOString();
const at = (secondsAfterStart: number) =>
  new Date(Date.parse(started) + secondsAfterStart * 1000).toISOString();

function query(result: unknown) {
  const value = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  value.select.mockReturnValue(value);
  value.update.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.order.mockReturnValue(value);
  return value;
}

/** Session row, no duplicate chunk, then the post-reservation checks. */
function storage(consents: { data: unknown; error: unknown }) {
  const saved = { id: host, status: 'completed' };
  const persisted = query({ data: saved, error: null });
  const from = vi
    .fn()
    .mockReturnValueOnce(query({ data: { id: host, created_at: started } }))
    .mockReturnValueOnce(query({ data: null, error: null }))
    .mockReturnValueOnce(query({ data: { ended_at: null }, error: null }))
    .mockReturnValue(persisted);
  // Rows default to the notice in force; stale versions are set explicitly.
  const log = query({
    ...consents,
    data: Array.isArray(consents.data)
      ? consents.data.map((row) => ({
          notice_version: MEET_CONSENT_NOTICE_VERSION,
          ...row,
        }))
      : consents.data,
  });
  const schema = vi.fn(() => ({ from: vi.fn(() => log) }));
  const rpc = vi.fn().mockResolvedValue({ data: { id: host }, error: null });
  mocks.access.mockResolvedValue({
    db: { from, rpc, schema },
    meetingId: host,
    user: { id: host },
  });
  return { schema, rpc, persisted };
}

function upload(
  sources: Array<{
    speakerAccountId?: string;
    at: number;
    kind?: 'microphone' | 'shared_audio';
  }>
) {
  const body = new FormData();
  body.set('id', host);
  body.set('sessionId', host);
  body.set('sequence', '0');
  body.set('startSeconds', '0');
  body.set(
    'sources',
    JSON.stringify(
      sources.map((source) => ({
        speakerAccountId: source.speakerAccountId,
        sourceKind: source.kind ?? 'microphone',
        startSeconds: source.at,
      }))
    )
  );
  sources.forEach((_, index) => {
    body.set(`audio_${index}`, encodeMeetWav(new Float32Array(16000)));
  });
  return new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    headers: { 'X-Meet-Audio-Batch': '1' },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.speaker.mockImplementation(async ({ accountId }) => ({
    accountId,
    displayName: accountId,
    kind: 'microphone',
  }));
});

describe('server-side transcription consent', () => {
  it('refuses another participant without a consent record before any charge', async () => {
    const { rpc } = storage({ data: [], error: null });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(upload([{ speakerAccountId: guest, at: 5 }]), params)
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'MEET_AI_CONSENT_REQUIRED',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.speaker).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('refuses unattributed audio, which cannot be matched to a decision', async () => {
    storage({ data: [], error: null });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(upload([{ at: 5 }]), params)
    );
    expect(response.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('never sends a declined or withdrawn participant to the provider', async () => {
    const { persisted } = storage({
      data: [
        { user_id: guest, decision: 'allow', created_at: at(1) },
        { user_id: decliner, decision: 'allow', created_at: at(1) },
        { user_id: decliner, decision: 'withdraw', created_at: at(20) },
      ],
      error: null,
    });
    mocks.generate.mockResolvedValue({
      text: '',
      transcripts: ['host words', 'guest words'],
      usage: {},
      costUsd: 0.001,
    });
    await transcribeMeetChunk(
      upload([
        { speakerAccountId: host, at: 30 },
        { speakerAccountId: decliner, at: 30 },
        { speakerAccountId: guest, at: 30 },
      ]),
      params
    );
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate.mock.calls[0]?.[0].audioSegments).toHaveLength(2);
    expect(mocks.speaker.mock.calls.map(([call]) => call.accountId)).toEqual([
      host,
      guest,
    ]);
    const update = persisted.update.mock.calls[0]?.[0];
    expect(update.usage.excludedSources).toBe(1);
    expect(
      update.usage.segments.map(
        (segment: { speaker: { accountId: string } }) =>
          segment.speaker.accountId
      )
    ).toEqual([host, guest]);
  });

  it('excludes audio captured before a participant allowed', async () => {
    storage({
      data: [{ user_id: guest, decision: 'allow', created_at: at(40) }],
      error: null,
    });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(upload([{ speakerAccountId: guest, at: 5 }]), params)
    );
    expect(response.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('fails closed for others when the consent log is not deployed yet', async () => {
    storage({ data: null, error: { code: 'PGRST205' } });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(upload([{ speakerAccountId: guest, at: 5 }]), params)
    );
    expect(response.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('leaves solo host uploads unaffected and skips the consent lookup', async () => {
    const { schema } = storage({ data: null, error: { code: 'PGRST205' } });
    mocks.generate.mockResolvedValue({
      text: '',
      transcripts: ['solo words'],
      usage: {},
      costUsd: 0.001,
    });
    await transcribeMeetChunk(
      upload([{ speakerAccountId: host, at: 5 }]),
      params
    );
    expect(schema).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it('rejects a clip that starts 1 ms before the allow and accepts one at it (F3)', async () => {
    const consents = {
      data: [
        {
          id: '1',
          user_id: guest,
          decision: 'allow',
          created_at: at(30),
        },
      ],
      error: null,
    };
    storage(consents);
    const early = await meetAiResponse(() =>
      transcribeMeetChunk(
        upload([{ speakerAccountId: guest, at: 29.999 }]),
        params
      )
    );
    expect(early.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
    storage(consents);
    mocks.generate.mockResolvedValue({
      text: '',
      transcripts: ['guest words'],
      usage: {},
      costUsd: 0.001,
    });
    await transcribeMeetChunk(
      upload([{ speakerAccountId: guest, at: 30 }]),
      params
    );
    expect(mocks.generate).toHaveBeenCalledOnce();
  });

  it('rejects a clip that overlaps a withdrawal even after a re-allow (F3)', async () => {
    storage({
      data: [
        { id: '1', user_id: guest, decision: 'allow', created_at: at(1) },
        { id: '2', user_id: guest, decision: 'withdraw', created_at: at(20.5) },
        { id: '3', user_id: guest, decision: 'allow', created_at: at(40) },
      ],
      error: null,
    });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(upload([{ speakerAccountId: guest, at: 20 }]), params)
    );
    expect(response.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('rejects a second overlapping host microphone track before any charge (F1a)', async () => {
    const { rpc } = storage({ data: [], error: null });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(
        upload([
          { speakerAccountId: host, at: 5 },
          { speakerAccountId: host, at: 5.5 },
        ]),
        params
      )
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'MEET_AI_HOST_TRACKS',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('keeps host screen audio only when the host is alone; anyone else or an unknown audience drops it (F2)', async () => {
    const sources = [
      { speakerAccountId: host, at: 5 },
      { speakerAccountId: host, at: 5, kind: 'shared_audio' as const },
    ];
    for (const [audience, segments] of [
      [1, 2],
      [2, 1],
      [3, 1],
      [null, 1],
    ] as const) {
      vi.clearAllMocks();
      storage({ data: [], error: null });
      mocks.audience.mockResolvedValue(audience);
      mocks.generate.mockResolvedValue({
        text: '',
        transcripts: Array.from({ length: segments }, () => 'words'),
        usage: {},
        costUsd: 0.001,
      });
      await transcribeMeetChunk(upload(sources), params);
      expect(mocks.audience).toHaveBeenCalledWith(host, host);
      expect(mocks.generate.mock.calls[0]?.[0].audioSegments).toHaveLength(
        segments
      );
    }
  });
  const staleNotice = 'meet-transcription-v2-old';
  const states: Array<[string, unknown[], boolean]> = [
    ['no record', [], false],
    ['deny', [{ decision: 'deny', created_at: at(1) }], false],
    [
      'withdraw after allow',
      [
        { decision: 'allow', created_at: at(1) },
        { decision: 'withdraw', created_at: at(2) },
      ],
      false,
    ],
    [
      'allow under a stale notice',
      [{ decision: 'allow', created_at: at(1), notice_version: staleNotice }],
      false,
    ],
    [
      'stale allow after a current one',
      [
        { decision: 'allow', created_at: at(1) },
        { decision: 'allow', created_at: at(2), notice_version: staleNotice },
      ],
      false,
    ],
    ['current allow', [{ decision: 'allow', created_at: at(1) }], true],
  ];
  it.each(states)(
    'transcription consent state: %s',
    async (_name, rows, forwarded) => {
      const { rpc, persisted } = storage({
        data: rows.map((row, index) => ({
          id: String(index),
          user_id: guest,
          ...(row as object),
        })),
        error: null,
      });
      mocks.generate.mockResolvedValue({
        text: '',
        transcripts: ['guest words'],
        usage: {},
        costUsd: 0.001,
      });
      const response = await meetAiResponse(() =>
        transcribeMeetChunk(
          upload([{ speakerAccountId: guest, at: 30 }]),
          params
        )
      );
      if (forwarded) {
        expect(mocks.generate).toHaveBeenCalledOnce();
        expect(mocks.speaker).toHaveBeenCalledOnce();
        return;
      }
      // Not forwarded, no speaker lookup, no reservation, nothing stored.
      expect(response.status).toBe(403);
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.speaker).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(persisted.update).not.toHaveBeenCalled();
    }
  );

  it('stops a participant within one chunk of a mid-session withdrawal', async () => {
    const consents = [
      { id: '1', user_id: guest, decision: 'allow', created_at: at(1) },
      { id: '2', user_id: guest, decision: 'withdraw', created_at: at(25) },
    ];
    // The chunk captured before the withdrawal and the next one are both
    // dropped: the latest decision wins, so nothing from this person is sent
    // once they withdraw, even if the upload arrives later.
    for (const clipStart of [10, 30]) {
      vi.clearAllMocks();
      const { rpc } = storage({ data: consents, error: null });
      const response = await meetAiResponse(() =>
        transcribeMeetChunk(
          upload([{ speakerAccountId: guest, at: clipStart }]),
          params
        )
      );
      expect(response.status).toBe(403);
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    }
    // The same person's clip from before they withdrew went out while allowed.
    vi.clearAllMocks();
    storage({ data: consents.slice(0, 1), error: null });
    mocks.generate.mockResolvedValue({
      text: '',
      transcripts: ['guest words'],
      usage: {},
      costUsd: 0.001,
    });
    await transcribeMeetChunk(
      upload([{ speakerAccountId: guest, at: 10 }]),
      params
    );
    expect(mocks.generate).toHaveBeenCalledOnce();
  });

  it('forwards only the consented participants of a mixed upload', async () => {
    const { persisted, rpc } = storage({
      data: [
        { id: '1', user_id: guest, decision: 'allow', created_at: at(1) },
        { id: '2', user_id: decliner, decision: 'deny', created_at: at(1) },
        {
          id: '3',
          user_id: stale,
          decision: 'allow',
          created_at: at(1),
          notice_version: staleNotice,
        },
      ],
      error: null,
    });
    mocks.generate.mockResolvedValue({
      text: '',
      transcripts: ['host words', 'guest words'],
      usage: {},
      costUsd: 0.002,
    });
    await transcribeMeetChunk(
      upload([
        { speakerAccountId: host, at: 30 },
        { speakerAccountId: decliner, at: 30 },
        { speakerAccountId: stale, at: 30 },
        { speakerAccountId: guest, at: 30 },
        { speakerAccountId: undefined, at: 30 },
        { speakerAccountId: bystander, at: 30 },
      ]),
      params
    );
    expect(mocks.generate.mock.calls[0]?.[0].audioSegments).toHaveLength(2);
    expect(mocks.speaker.mock.calls.map(([call]) => call.accountId)).toEqual([
      host,
      guest,
    ]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(persisted.update.mock.calls[0]?.[0].usage.excludedSources).toBe(4);
  });
});
