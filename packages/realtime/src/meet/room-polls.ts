import { z } from 'zod';
import { canMeetRealtimeManageParticipants } from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomServiceState } from './room-service';

const MAX_POLLS = 50;
const MAX_RESPONSES = 500;
const MAX_POLL_BYTES = 256 * 1024;
const optionIds = z.array(z.uuid()).min(1).max(10);
const options = z
  .array(z.string().trim().min(1).max(120))
  .min(2)
  .max(10)
  .refine((labels) => new Set(labels.map(wordKey)).size === labels.length);
const fields = { question: z.string().trim().min(1).max(240) };
export const pollDefinitionSchema = z
  .discriminatedUnion('type', [
    z.strictObject({ ...fields, type: z.literal('single_choice'), options }),
    z.strictObject({
      ...fields,
      type: z.literal('multiple_choice'),
      options,
      maxChoices: z.number().int().min(1).max(10),
    }),
    z.strictObject({
      ...fields,
      type: z.literal('rating'),
      min: z.literal(1),
      max: z.union([z.literal(5), z.literal(10)]),
    }),
    z.strictObject({ ...fields, type: z.literal('word_cloud') }),
    z.strictObject({ ...fields, type: z.literal('open_text') }),
  ])
  .refine(
    (poll) =>
      poll.type !== 'multiple_choice' || poll.maxChoices <= poll.options.length
  );

const normalizedPhrase = (text: string) =>
  text.normalize('NFC').trim().replace(/\s+/gu, ' ');
function wordKey(text: string) {
  return normalizedPhrase(text).normalize('NFKC').toLowerCase();
}

const responseSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('single_choice'), optionId: z.uuid() }),
  z.strictObject({ type: z.literal('multiple_choice'), optionIds }),
  z.strictObject({
    type: z.literal('rating'),
    rating: z.number().int().min(1).max(10),
  }),
  z.strictObject({
    type: z.literal('word_cloud'),
    text: z
      .string()
      .max(240)
      .transform(normalizedPhrase)
      .pipe(z.string().min(1).max(60)),
  }),
  z.strictObject({
    type: z.literal('open_text'),
    text: z.string().trim().min(1).max(500),
  }),
]);
export type PollDefinition = z.infer<typeof pollDefinitionSchema>;
export type PollResponse = z.infer<typeof responseSchema>;

const pollId = z.uuid();
const vote = { pollId, response: responseSchema };
const create = { definition: pollDefinitionSchema, anonymous: z.boolean() };
const visibility = { pollId, resultsVisible: z.boolean() };

export const pollMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), ...create }),
  z.strictObject({ action: z.literal('launch'), pollId }),
  z.strictObject({ action: z.literal('vote'), ...vote }),
  z.strictObject({ action: z.literal('close'), pollId }),
  z.strictObject({ action: z.literal('visibility'), ...visibility }),
  z.strictObject({ action: z.literal('delete'), pollId }),
]);

export const pollRoomCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('poll.list') }),
  z.strictObject({ action: z.literal('poll.create'), ...create }),
  z.strictObject({ action: z.literal('poll.launch'), pollId }),
  z.strictObject({ action: z.literal('poll.vote'), ...vote }),
  z.strictObject({ action: z.literal('poll.close'), pollId }),
  z.strictObject({ action: z.literal('poll.visibility'), ...visibility }),
  z.strictObject({ action: z.literal('poll.delete'), pollId }),
  z.strictObject({
    action: z.literal('poll.export'),
    pollId,
    format: z.enum(['csv', 'json']),
  }),
  z.strictObject({ action: z.literal('poll.summary'), pollId }),
  z.strictObject({ action: z.literal('poll.authorize') }),
]);

type PollCommand = z.infer<typeof pollRoomCommandSchema>;
type PollOption = { id: string; label: string };
type PollQuestion =
  | Exclude<PollDefinition, { options: string[] }>
  | (Omit<Extract<PollDefinition, { type: 'single_choice' }>, 'options'> & {
      options: PollOption[];
    })
  | (Omit<Extract<PollDefinition, { type: 'multiple_choice' }>, 'options'> & {
      options: PollOption[];
    });

type StoredResponse = {
  userId: string;
  displayName: string;
  response: PollResponse;
  submittedAt?: number;
};
type PollQuizMeta = {
  timeLimitSec?: number;
  points?: number;
  explanation?: string;
  correctOptionIds?: string[];
};
export type RoomPoll = PollQuestion & {
  id: string;
  kind?: 'poll' | 'quiz' | 'assignment';
  quizMeta?: PollQuizMeta;
  status: 'draft' | 'active' | 'closed';
  anonymous: boolean;
  resultsVisible: boolean;
  responses: StoredResponse[];
};
type PollTally = { label: string; count: number };
export type PollResults = {
  responseCount: number;
  tally: PollTally[];
  average?: number;
  answers?: string[];
};
export type ProjectedPoll = PollQuestion &
  Omit<RoomPoll, keyof PollQuestion | 'responses'> & {
    myResponse: PollResponse | null;
    results: PollResults | null;
  };
export type PollsView = { canManage: boolean; polls: ProjectedPoll[] };

function responseFits(poll: RoomPoll, response: PollResponse) {
  switch (response.type) {
    case 'single_choice':
      return (
        poll.type === response.type &&
        poll.options.some(({ id }) => id === response.optionId)
      );
    case 'multiple_choice':
      return (
        poll.type === response.type &&
        response.optionIds.length <= poll.maxChoices &&
        new Set(response.optionIds).size === response.optionIds.length &&
        response.optionIds.every((id) =>
          poll.options.some((option) => option.id === id)
        )
      );
    case 'rating':
      return (
        poll.type === response.type &&
        response.rating >= poll.min &&
        response.rating <= poll.max
      );
    default:
      return poll.type === response.type;
  }
}

function pollResults(poll: RoomPoll): PollResults {
  const responseCount = poll.responses.length;
  switch (poll.type) {
    case 'single_choice':
    case 'multiple_choice': {
      const counts = new Map(poll.options.map(({ id }) => [id, 0]));
      for (const { response } of poll.responses) {
        const selected =
          response.type === 'single_choice'
            ? [response.optionId]
            : response.type === 'multiple_choice'
              ? response.optionIds
              : [];
        for (const id of selected) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return {
        responseCount,
        tally: poll.options.map(({ id, label }) => ({
          label,
          count: counts.get(id) ?? 0,
        })),
      };
    }
    case 'rating': {
      const counts = Array.from({ length: poll.max - poll.min + 1 }, () => 0);
      let total = 0;
      for (const { response } of poll.responses) {
        if (response.type !== 'rating') continue;
        const index = response.rating - poll.min;
        counts[index] = (counts[index] ?? 0) + 1;
        total += response.rating;
      }
      return {
        responseCount,
        tally: counts.map((count, index) => ({
          label: String(index + poll.min),
          count,
        })),
        average: responseCount ? total / responseCount : undefined,
      };
    }
    case 'word_cloud': {
      const words = new Map<string, PollTally>();
      for (const { response } of poll.responses) {
        if (response.type !== 'word_cloud') continue;
        const key = wordKey(response.text);
        const existing = words.get(key);
        if (existing) existing.count++;
        else words.set(key, { label: response.text, count: 1 });
      }
      return {
        responseCount,
        tally: [...words.values()].sort(
          (a, b) => b.count - a.count || a.label.localeCompare(b.label)
        ),
      };
    }
    case 'open_text':
      return {
        responseCount,
        tally: [],
        answers: poll.responses
          .flatMap(({ response }) =>
            response.type === 'open_text' ? [response.text] : []
          )
          .sort(),
      };
  }
}

export function projectPollsForUser(
  polls: readonly RoomPoll[],
  userId: string,
  canManage: boolean
): ProjectedPoll[] {
  return polls.flatMap((poll) => {
    if (poll.status === 'draft' && !canManage) return [];
    const { responses, quizMeta, ...fields } = poll;
    const visibleQuizMeta =
      canManage || poll.status === 'closed'
        ? quizMeta
        : quizMeta && {
            timeLimitSec: quizMeta.timeLimitSec,
            points: quizMeta.points,
          };
    return [
      {
        ...fields,
        kind: fields.kind ?? 'poll',
        quizMeta: visibleQuizMeta,
        myResponse:
          responses.find((entry) => entry.userId === userId)?.response ?? null,
        results:
          canManage || poll.status === 'closed' || poll.resultsVisible
            ? pollResults(poll)
            : null,
      },
    ];
  });
}

export function exportPollJson(poll: RoomPoll) {
  const { responses, ...fields } = poll;
  return {
    ...fields,
    kind: fields.kind ?? 'poll',
    results: pollResults(poll),
    ...(poll.anonymous ? {} : { responses }),
  };
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^(?:\s*[=+@-]|[^\S\t\r]*[\t\r])/u.test(text)
    ? `'${text}`
    : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportPollCsv(poll: RoomPoll) {
  const { responseCount, tally, average, answers } = pollResults(poll);
  const rows: Array<Array<string | number>> = [
    ['question', poll.question],
    ['responses', responseCount],
  ];
  if (average !== undefined) rows.push(['average', average]);
  if (tally.length)
    rows.push(
      ['answer', 'count'],
      ...tally.map(({ label, count }) => [label, count])
    );
  if (poll.anonymous) {
    if (answers?.length)
      rows.push(['answer'], ...answers.map((answer) => [answer]));
  } else {
    rows.push(['user_id', 'display_name', 'response']);
    for (const { userId, displayName, response } of poll.responses) {
      const label = (id: string) =>
        'options' in poll
          ? (poll.options.find((item) => item.id === id)?.label ?? '')
          : '';
      const value =
        response.type === 'single_choice'
          ? label(response.optionId)
          : response.type === 'multiple_choice'
            ? response.optionIds.map(label).join(', ')
            : response.type === 'rating'
              ? response.rating
              : response.text;
      rows.push([userId, displayName, value]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function applyRoomPolls(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  command: PollCommand
) {
  const accountId = token.accountId ?? token.userId;
  const canManage = canMeetRealtimeManageParticipants(token);
  const present = Object.values(snapshot.presence).some(
    (person) => (person.accountId ?? person.userId) === accountId
  );
  const fail = (error: string, status: number) => ({
    state: snapshot,
    body: { error },
    status,
  });
  if (
    token.guest &&
    command.action !== 'poll.list' &&
    command.action !== 'poll.vote'
  )
    return fail('Sign in required', 403);
  if (
    !canManage &&
    ((!present && !snapshot.approved?.[accountId]) ||
      (command.action !== 'poll.list' && command.action !== 'poll.vote'))
  )
    return fail('Forbidden', 403);

  const polls = snapshot.polls ?? [];
  const view = (): PollsView => ({
    canManage,
    polls: projectPollsForUser(polls, accountId, canManage),
  });
  const save = (next: RoomPoll[], body: unknown = { ok: true }) => {
    if (
      new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_POLL_BYTES
    )
      return fail('Room poll storage is full', 409);
    return { state: { ...snapshot, polls: next }, body };
  };
  if (command.action === 'poll.list') return { state: snapshot, body: view() };
  if (
    snapshot.ended &&
    (command.action === 'poll.authorize' ||
      command.action === 'poll.create' ||
      command.action === 'poll.launch' ||
      command.action === 'poll.vote')
  )
    return fail('Meeting has ended', 409);
  if (command.action === 'poll.authorize')
    return { state: snapshot, body: { ok: true } };
  if (command.action === 'poll.create') {
    if (polls.length >= MAX_POLLS) return fail('Room poll limit reached', 409);
    const { definition } = command;
    const question =
      'options' in definition
        ? {
            ...definition,
            options: definition.options.map((label) => ({
              id: crypto.randomUUID(),
              label,
            })),
          }
        : definition;
    const id = crypto.randomUUID();
    return save(
      [
        ...polls,
        {
          ...question,
          id,
          kind: 'poll',
          status: 'draft',
          anonymous: command.anonymous,
          resultsVisible: false,
          responses: [],
        },
      ],
      { pollId: id }
    );
  }

  const poll = polls.find(({ id }) => id === command.pollId);
  if (!poll || (!canManage && poll.status === 'draft'))
    return fail('Poll not found', 404);
  const update = (next: RoomPoll) =>
    save(polls.map((item) => (item === poll ? next : item)));
  switch (command.action) {
    case 'poll.launch':
      if (poll.status === 'active')
        return { state: snapshot, body: { ok: true } };
      return poll.status === 'draft'
        ? update({ ...poll, status: 'active' })
        : fail('Only drafts can be launched', 409);
    case 'poll.close':
      if (poll.status === 'closed')
        return { state: snapshot, body: { ok: true } };
      return poll.status === 'active'
        ? update({ ...poll, status: 'closed' })
        : fail('Only active polls can be closed', 409);
    case 'poll.visibility':
      return update({ ...poll, resultsVisible: command.resultsVisible });
    case 'poll.delete':
      return save(polls.filter((item) => item !== poll));
    case 'poll.export':
      return {
        state: snapshot,
        body:
          command.format === 'csv' ? exportPollCsv(poll) : exportPollJson(poll),
      };
    case 'poll.summary':
      if (poll.status === 'draft') return fail('Poll has not launched', 409);
      return {
        state: snapshot,
        body: { question: poll.question, results: pollResults(poll) },
      };
    case 'poll.vote': {
      if (poll.status !== 'active') return fail('Poll is closed', 409);
      if (!responseFits(poll, command.response))
        return fail('Invalid poll response', 400);
      const existing = poll.responses.find(
        (entry) => entry.userId === accountId
      );
      if (!existing && poll.responses.length >= MAX_RESPONSES)
        return fail('Poll response limit reached', 409);
      if (
        existing &&
        JSON.stringify(existing.response) === JSON.stringify(command.response)
      )
        return { state: snapshot, body: { ok: true } };
      return update({
        ...poll,
        responses: [
          ...poll.responses.filter((entry) => entry.userId !== accountId),
          {
            userId: accountId,
            displayName: poll.anonymous ? '' : (token.displayName ?? ''),
            response: command.response,
            submittedAt: Date.now(),
          },
        ],
      });
    }
  }
}
