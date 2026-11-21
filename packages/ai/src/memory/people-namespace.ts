// The people namespace contract for the memory service. People memories live
// under container tags the service itself guards: only the people registry
// caller may use `tuturuuu.people.*` tags, and that caller may use nothing
// else. The service runs `authorizeMemoryRequest` before any storage access;
// `PEOPLE_ISOLATION_CASES` is the acceptance suite every implementation
// runs against its request handler. Framework-free so a Worker can import it.
// See apps/docs/platform/ai/memory-service.mdx#people-namespace.

export const PEOPLE_TAG_PREFIX = 'tuturuuu.people.';
export const PEOPLE_MEMORY_CALLER = 'people-registry';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TAG = new RegExp(
  `^tuturuuu\\.people\\.(${UUID})\\.(person|conversation)\\.(${UUID})$`
);
const CUSTOM_ID = new RegExp(`^people\\.(${UUID})\\.(${UUID})$`);
const uuid = new RegExp(`^${UUID}$`);

export type PeopleSubjectKind = 'person' | 'conversation';
export type PeopleSubject = {
  wsId: string;
  kind: PeopleSubjectKind;
  id: string;
};

export type MemoryOperation =
  | 'add'
  | 'search'
  | 'list'
  | 'read'
  | 'read_by_custom_id'
  | 'update'
  | 'forget'
  | 'purge';

export type MemoryCaller = { id: string };

export type MemoryRequest = {
  operation: MemoryOperation;
  containerTags: readonly string[];
  customId?: string;
};

export type MemoryAuthorization =
  | { ok: true; subjects: PeopleSubject[] }
  | {
      ok: false;
      reason:
        | 'no_container'
        | 'namespace_denied'
        | 'scope_denied'
        | 'invalid_tag'
        | 'cross_workspace'
        | 'custom_id_mismatch';
    };

export function peopleContainerTag(subject: PeopleSubject) {
  if (!uuid.test(subject.wsId) || !uuid.test(subject.id))
    throw new Error('People memory tags need lowercase UUIDs');
  return `${PEOPLE_TAG_PREFIX}${subject.wsId}.${subject.kind}.${subject.id}`;
}

export function parsePeopleContainerTag(tag: string): PeopleSubject | null {
  const match = TAG.exec(tag);
  if (!match) return null;
  return {
    wsId: match[1] as string,
    kind: match[2] as PeopleSubjectKind,
    id: match[3] as string,
  };
}

// Any spelling that a lenient store could treat as the people namespace:
// case, Unicode compatibility forms and surrounding whitespace are folded,
// and the bare prefix without a trailing dot counts.
export function isPeopleNamespaceTag(tag: string) {
  const folded = tag.normalize('NFKC').trim().toLowerCase();
  return folded === 'tuturuuu.people' || folded.startsWith(PEOPLE_TAG_PREFIX);
}

export function peopleCustomId(wsId: string, ledgerId: string) {
  if (!uuid.test(wsId) || !uuid.test(ledgerId))
    throw new Error('People memory custom IDs need lowercase UUIDs');
  return `people.${wsId}.${ledgerId}`;
}

export function parsePeopleCustomId(customId: string) {
  const match = CUSTOM_ID.exec(customId);
  return match
    ? { wsId: match[1] as string, ledgerId: match[2] as string }
    : null;
}

export function authorizeMemoryRequest(
  caller: MemoryCaller,
  request: MemoryRequest
): MemoryAuthorization {
  if (request.containerTags.length === 0)
    return { ok: false, reason: 'no_container' };
  const isPeopleCaller = caller.id === PEOPLE_MEMORY_CALLER;
  const touchesPeople = request.containerTags.some(isPeopleNamespaceTag);

  if (!isPeopleCaller) {
    // Other namespaces keep their own rules; this contract only fences people.
    return touchesPeople
      ? { ok: false, reason: 'namespace_denied' }
      : { ok: true, subjects: [] };
  }

  const subjects: PeopleSubject[] = [];
  for (const tag of request.containerTags) {
    if (!isPeopleNamespaceTag(tag))
      return { ok: false, reason: 'scope_denied' };
    const subject = parsePeopleContainerTag(tag);
    if (!subject) return { ok: false, reason: 'invalid_tag' };
    subjects.push(subject);
  }
  const wsId = subjects[0]?.wsId;
  if (subjects.some((subject) => subject.wsId !== wsId))
    return { ok: false, reason: 'cross_workspace' };
  if (request.customId !== undefined) {
    const parsed = parsePeopleCustomId(request.customId);
    if (!parsed || parsed.wsId !== wsId)
      return { ok: false, reason: 'custom_id_mismatch' };
  } else if (
    request.operation === 'add' ||
    request.operation === 'read_by_custom_id'
  ) {
    return { ok: false, reason: 'custom_id_mismatch' };
  }
  return { ok: true, subjects };
}

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const PERSON = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const LEDGER = '55555555-5555-4555-8555-555555555555';
const personTag = `${PEOPLE_TAG_PREFIX}${WS}.person.${PERSON}`;
const conversationTag = `${PEOPLE_TAG_PREFIX}${WS}.conversation.${CONVERSATION}`;
const people = { id: PEOPLE_MEMORY_CALLER };
const assistant = { id: 'assistant' };

export type PeopleIsolationCase = {
  name: string;
  caller: MemoryCaller;
  request: MemoryRequest;
  expect: true | Exclude<MemoryAuthorization, { ok: true }>['reason'];
};

// Acceptance cases for every memory service implementation: run each through
// the service's request handler and require the same decision.
export const PEOPLE_ISOLATION_CASES: readonly PeopleIsolationCase[] = [
  {
    name: 'people caller adds to a person tag with its custom ID',
    caller: people,
    request: {
      operation: 'add',
      containerTags: [personTag],
      customId: `people.${WS}.${LEDGER}`,
    },
    expect: true,
  },
  {
    name: 'people caller lists a person and a conversation in one workspace',
    caller: people,
    request: { operation: 'list', containerTags: [personTag, conversationTag] },
    expect: true,
  },
  {
    name: 'people caller reads by custom ID',
    caller: people,
    request: {
      operation: 'read_by_custom_id',
      containerTags: [personTag],
      customId: `people.${WS}.${LEDGER}`,
    },
    expect: true,
  },
  {
    name: 'people caller purges its own tag',
    caller: people,
    request: { operation: 'purge', containerTags: [personTag] },
    expect: true,
  },
  {
    name: 'assistant caller cannot search a person tag',
    caller: assistant,
    request: { operation: 'search', containerTags: [personTag] },
    expect: 'namespace_denied',
  },
  {
    name: 'assistant caller cannot hide a people tag among its own',
    caller: assistant,
    request: {
      operation: 'list',
      containerTags: [
        `tuturuuu.user.${PERSON}.workspace.${WS}`,
        conversationTag,
      ],
    },
    expect: 'namespace_denied',
  },
  {
    name: 'assistant caller cannot use a case variant',
    caller: assistant,
    request: {
      operation: 'search',
      containerTags: [`TUTURUUU.PEOPLE.${WS}.person.${PERSON}`],
    },
    expect: 'namespace_denied',
  },
  {
    name: 'assistant caller cannot use a fullwidth variant',
    caller: assistant,
    request: {
      operation: 'search',
      containerTags: [`ｔｕｔｕｒｕｕｕ.people.${WS}`],
    },
    expect: 'namespace_denied',
  },
  {
    name: 'assistant caller cannot use the bare prefix',
    caller: assistant,
    request: { operation: 'list', containerTags: [' tuturuuu.people '] },
    expect: 'namespace_denied',
  },
  {
    name: 'Meet caller cannot read a conversation tag',
    caller: { id: 'meet' },
    request: { operation: 'read', containerTags: [conversationTag] },
    expect: 'namespace_denied',
  },
  {
    name: 'Fleet caller cannot write a person tag',
    caller: { id: 'fleet' },
    request: {
      operation: 'add',
      containerTags: [personTag],
      customId: `people.${WS}.${LEDGER}`,
    },
    expect: 'namespace_denied',
  },
  {
    name: 'other callers cannot purge a people tag',
    caller: assistant,
    request: { operation: 'purge', containerTags: [personTag] },
    expect: 'namespace_denied',
  },
  {
    name: 'people caller cannot read assistant memory',
    caller: people,
    request: {
      operation: 'search',
      containerTags: [`tuturuuu.user.${PERSON}.workspace.${WS}`],
    },
    expect: 'scope_denied',
  },
  {
    name: 'people caller cannot mix in assistant memory',
    caller: people,
    request: {
      operation: 'list',
      containerTags: [personTag, `tuturuuu.user.${PERSON}.workspace.${WS}`],
    },
    expect: 'scope_denied',
  },
  {
    name: 'people caller cannot span workspaces',
    caller: people,
    request: {
      operation: 'list',
      containerTags: [
        personTag,
        `${PEOPLE_TAG_PREFIX}${OTHER_WS}.person.${PERSON}`,
      ],
    },
    expect: 'cross_workspace',
  },
  {
    name: 'people caller cannot use a malformed people tag',
    caller: people,
    request: {
      operation: 'search',
      containerTags: [`${PEOPLE_TAG_PREFIX}${WS}.memory.${PERSON}`],
    },
    expect: 'invalid_tag',
  },
  {
    name: 'people caller cannot use an uppercase people tag',
    caller: people,
    request: { operation: 'search', containerTags: [personTag.toUpperCase()] },
    expect: 'invalid_tag',
  },
  {
    name: 'people caller cannot add without a custom ID',
    caller: people,
    request: { operation: 'add', containerTags: [personTag] },
    expect: 'custom_id_mismatch',
  },
  {
    name: 'people caller cannot use another workspace custom ID',
    caller: people,
    request: {
      operation: 'add',
      containerTags: [personTag],
      customId: `people.${OTHER_WS}.${LEDGER}`,
    },
    expect: 'custom_id_mismatch',
  },
  {
    name: 'people caller cannot use an empty container list',
    caller: people,
    request: { operation: 'list', containerTags: [] },
    expect: 'no_container',
  },
];
