import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { MIRA_PRIVATE_NOTICE_VERSION } from './room-mira-private';
import type { MeetingProgramming } from './room-programming';
import type { RoomServiceState } from './room-service';

export const programmingRangeSchema = z
  .object({
    filePath: z.string().min(1).max(240),
    startLine: z.number().int().min(1).max(100000),
    endLine: z.number().int().min(1).max(100000),
  })
  .refine(
    ({ startLine, endLine }) => endLine >= startLine && endLine - startLine < 80
  );

export const programmingCodeCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), range: programmingRangeSchema }),
  z.object({
    action: z.literal('resolve'),
    id: z.uuid(),
    decision: z.enum(['accepted', 'dismissed']),
    range: programmingRangeSchema,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    original: z.string().max(8000),
    replacement: z.string().max(8000),
  }),
]);
export type ProgrammingCodeCommand = z.infer<
  typeof programmingCodeCommandSchema
>;

export const programmingMiraAnswerSchema = z.object({
  explanation: z.string().trim().min(1).max(1400),
  replacement: z.string().max(8000).nullable(),
});

type Range = z.infer<typeof programmingRangeSchema>;
type Answer = z.infer<typeof programmingMiraAnswerSchema>;
type Source = 'chat' | 'live';

export type ProgrammingMiraPresence = Partial<Range> & {
  active: boolean;
  source: Source;
  statusText?: string;
  proposedFix?:
    | (Range & {
        id: string;
        original: string;
        replacement: string;
        explanation: string;
        linkedFailure?: string;
        status: 'proposed' | 'accepted' | 'dismissed';
        acceptedBy?: string;
      })
    | null;
  updatedAt: number;
};

export type ProgrammingMiraContext = Range & {
  original: string;
  digest: string;
  linkedFailure?: string;
};

const intent = z.enum(['explain', 'fix']);

type Draft = {
  id: string;
  owner: string;
  revision: number;
  source: Source;
  context: ProgrammingMiraContext & {
    intent: z.infer<typeof intent>;
    failureDetail?: string;
  };
  expires: number;
  answer?: Answer;
  sessionId?: string;
};

export type RoomProgrammingMira = {
  generation: string | null;
  presence: ProgrammingMiraPresence | null;
  draft?: Draft;
  digest?: string;
  resolution?: { decision: 'accepted' | 'dismissed'; until: number };
};

const resolution = z.enum(['accepted', 'dismissed']);
const attempt = z.object({
  id: z.uuid(),
  generation: z.uuid().nullable(),
});
const contextSchema = programmingRangeSchema.and(
  z.object({
    original: z.string().max(8000),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    linkedFailure: z.string().max(200).optional(),
    failureDetail: z.string().max(800).optional(),
    intent,
  })
);
const command = z.union([
  z.object({
    action: z.literal('programming.miraPresence'),
    phase: z.literal('start'),
    attempt,
    revision: z.number().int().positive(),
    source: z.enum(['chat', 'live']),
    context: contextSchema,
    sessionId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal('programming.miraPresence'),
    phase: z.enum(['publish', 'cancel', 'draft']),
    attempt,
    answer: programmingMiraAnswerSchema.optional(),
  }),
  z.object({
    action: z.literal('programming.voiceContext'),
    sessionId: z.uuid(),
    id: z.uuid().optional(),
    answer: programmingMiraAnswerSchema.optional(),
  }),
  z.object({
    action: z.literal('programming.resolveFix'),
    attempt,
    phase: z.enum(['begin', 'finish', 'release']),
    decision: resolution,
  }),
]);

export function programmingMiraResolutionPending(state: RoomServiceState) {
  return (state.programmingMira?.resolution?.until ?? 0) > Date.now();
}

export function programmingMiraRead(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload
) {
  const mira = state.programmingMira;
  const draft = mira?.draft;
  const current =
    draft &&
    draft.expires > Date.now() &&
    hasPrivateChoice(
      state,
      token,
      draft.owner,
      draft.revision,
      draft.sessionId
    );
  return {
    generation: mira?.generation ?? null,
    miraPresence: draft && !current ? null : (mira?.presence ?? null),
    voiceDraft:
      draft?.source === 'live' &&
      draft.owner === (token.accountId ?? token.userId) &&
      current
        ? { id: draft.id, answer: draft.answer ?? null }
        : null,
  };
}

function hasPrivateChoice(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  owner: string,
  revision: number,
  sessionId?: string
) {
  const choice = state.miraPrivate?.choices[owner];
  return (
    choice?.choice === 'continue' &&
    choice.version === MIRA_PRIVATE_NOTICE_VERSION &&
    choice.revision === revision &&
    choice.meetingId === token.meetingId &&
    Object.values(state.presence).some(
      (person) => (person.accountId ?? person.userId) === owner
    ) &&
    (!sessionId || !!state.miraPrivate?.sessions[owner]?.includes(sessionId))
  );
}

export function applyRoomProgrammingMira(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  selection: MeetingProgramming | null,
  input: unknown
) {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  const fail = (status = 409) => ({
    state,
    body: { error: 'Mira coding action unavailable' },
    status,
  });
  if (!token.scopes.includes('meet:server') || token.role !== 'host')
    return fail(403);
  if (!selection || state.ended) return fail();
  const existing = state.programmingMira;
  const account = token.accountId ?? token.userId;
  if (
    !Object.values(state.presence).some(
      (person) => (person.accountId ?? person.userId) === account
    )
  )
    return fail(403);
  const data = parsed.data;
  const now = Date.now();
  const draft = existing?.draft;
  const update = (next: RoomProgrammingMira) => ({
    state: { ...state, programmingMira: next },
    body: programmingMiraRead({ ...state, programmingMira: next }, token),
  });

  if (data.action === 'programming.voiceContext') {
    if (
      !token.scopes.includes('meet:live-server') ||
      !existing ||
      !draft ||
      draft.source !== 'live' ||
      draft.owner !== account ||
      draft.expires <= now ||
      draft.sessionId !== data.sessionId ||
      !hasPrivateChoice(state, token, account, draft.revision, data.sessionId)
    )
      return fail(403);
    if (!data.answer) {
      const { filePath, startLine, endLine, original, intent, failureDetail } =
        draft.context;
      return {
        state,
        body: {
          id: draft.id,
          filePath,
          startLine,
          endLine,
          original,
          intent,
          failureDetail,
        },
      };
    }
    if (
      data.id !== draft.id ||
      draft.answer ||
      (draft.context.intent === 'explain' && data.answer.replacement !== null)
    )
      return fail();
    return {
      state: {
        ...state,
        programmingMira: {
          ...existing,
          draft: { ...draft, answer: data.answer },
        },
      },
      body: { saved: true },
    };
  }

  if (token.scopes.includes('meet:live-server')) return fail(403);
  if (data.attempt.generation !== (existing?.generation ?? null)) return fail();
  if (data.action === 'programming.resolveFix') {
    const presence = existing?.presence;
    const fix = presence?.proposedFix;
    if (!existing || !presence || !fix || fix.id !== data.attempt.id)
      return fail();
    if (fix.status !== 'proposed')
      return fix.status === data.decision
        ? { state, body: programmingMiraRead(state, token) }
        : fail();
    if (data.phase === 'begin') {
      if (existing.resolution && existing.resolution.decision !== data.decision)
        return fail();
      const until = now + 60_000;
      return {
        state: {
          ...state,
          programmingMira: {
            ...existing,
            resolution: { decision: data.decision, until },
          },
        },
        body: { fix, digest: existing.digest, until },
      };
    }
    if (existing.resolution?.decision !== data.decision) return fail();
    if (data.phase === 'release')
      return update({ ...existing, resolution: undefined });
    return update({
      ...existing,
      resolution: undefined,
      presence: {
        ...presence,
        active: false,
        updatedAt: now,
        proposedFix: {
          ...fix,
          status: data.decision,
          acceptedBy:
            data.decision === 'accepted' ? token.displayName : undefined,
        },
      },
    });
  }

  if (data.phase === 'start') {
    if (
      existing?.presence?.proposedFix?.status === 'proposed' ||
      (draft &&
        draft.expires > now &&
        hasPrivateChoice(
          state,
          token,
          draft.owner,
          draft.revision,
          draft.sessionId
        ))
    )
      return fail();
    if (
      (data.source === 'live') !== !!data.sessionId ||
      !hasPrivateChoice(state, token, account, data.revision, data.sessionId)
    )
      return fail(403);
    const { filePath, startLine, endLine } = data.context;
    return update({
      generation: existing?.generation ?? null,
      presence: {
        active: true,
        source: data.source,
        filePath,
        startLine,
        endLine,
        updatedAt: now,
      },
      draft: {
        id: data.attempt.id,
        owner: account,
        revision: data.revision,
        source: data.source,
        context: data.context,
        sessionId: data.sessionId,
        expires: now + 3 * 60_000,
      },
    });
  }
  if (
    !existing ||
    !draft ||
    draft.owner !== account ||
    draft.id !== data.attempt.id
  )
    return fail();
  if (data.phase === 'cancel')
    return update({ generation: existing.generation, presence: null });
  if (
    draft.expires <= now ||
    !hasPrivateChoice(state, token, account, draft.revision, draft.sessionId)
  )
    return fail(403);
  if (data.phase === 'draft') {
    if (draft.source !== 'chat' || !data.answer || draft.answer) return fail();
    return update({ ...existing, draft: { ...draft, answer: data.answer } });
  }
  const answer = draft.answer;
  if (!answer) return fail();
  const { original, digest, linkedFailure, filePath, startLine, endLine } =
    draft.context;
  const range = { filePath, startLine, endLine };
  return update({
    generation: existing.generation,
    digest,
    presence: {
      ...range,
      active: false,
      source: draft.source,
      updatedAt: now,
      statusText: answer.explanation,
      proposedFix:
        answer.replacement === null || original === answer.replacement
          ? null
          : {
              ...range,
              id: draft.id,
              original,
              replacement: answer.replacement,
              explanation: answer.explanation,
              linkedFailure,
              status: 'proposed',
            },
    },
  });
}
