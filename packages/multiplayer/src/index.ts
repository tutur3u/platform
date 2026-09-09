import { type MockRecord, seedRecords } from './mock-catalog';

export type { MockApp, MockAppKind, MockRecord } from './mock-catalog';
export { mockAppCatalog, mockApps, seedRecords } from './mock-catalog';

export type RoomMode = 'open' | 'readonly' | 'private';
export type Identity = {
  id: string;
  email: string | null;
  name: string;
  expires: number;
  avatarUrl?: string;
  guestVersion?: number;
};
export type Member = {
  id: string;
  name: string;
  email: string | null;
  teamId: string;
  admin: boolean;
  guestVersion?: number;
};
export type Skill = { name: string; description: string; markdown: string };
export type Trace = { tool: string; input: string; output: string };
export type RunUsage = {
  turns: number;
  toolCalls: number;
  turnLimit: number;
  toolCallLimit: number;
};
export type Run = {
  id: string;
  at: number;
  prompt: string;
  scenario: string;
  answer: string;
  trace: Trace[];
  feedback: string;
  usage?: RunUsage;
};
export type TeamLimits = {
  aiCallLimit: number;
  agentTurnLimit: number;
  toolCallLimit: number;
};
export type WorkshopLimits = TeamLimits;
export type Team = {
  id: string;
  name: string;
  prompt: string;
  revision: number;
  skills: Skill[];
  records: MockRecord[];
  runs: Run[];
  aiCalls: number;
  limits: TeamLimits;
};
export type Scenario = { title: string; brief: string; criteria: string[] };
export type AuditEntry = {
  id: string;
  at: number;
  actor: string;
  action: string;
  teamId?: string;
  adminOnly?: boolean;
};
export type WorkshopSummary = Pick<
  Room,
  'id' | 'title' | 'startsAt' | 'endsAt' | 'mode' | 'showcase' | 'maxUsers'
> & { memberCount: number; teamCount: number; admin: boolean };
export type Room = {
  audit?: AuditEntry[];
  id: string;
  title: string;
  ownerId: string;
  startsAt: number;
  endsAt: number;
  maxUsers: number;
  mode: RoomMode;
  showcase: boolean;
  members: Member[];
  invites: string[];
  passwordHash: string | null;
  passwordExpires: number;
  guestVersion: number;
  teams: Team[];
  scenario: Scenario;
  scenarios: Scenario[];
  aiCalls: number;
  limits: WorkshopLimits;
  revision: number;
};

export const defaultWorkshopLimits: WorkshopLimits = {
  aiCallLimit: 200,
  agentTurnLimit: 8,
  toolCallLimit: 6,
};
export const defaultTeamLimits: TeamLimits = {
  aiCallLimit: 50,
  agentTurnLimit: 6,
  toolCallLimit: 5,
};

export type WorkshopScheduleError =
  | 'invalid'
  | 'start_too_old'
  | 'start_too_far'
  | 'end_too_soon'
  | 'end_too_late';

export function workshopScheduleError(
  startsAt: number,
  endsAt: number,
  now = Date.now()
): WorkshopScheduleError | null {
  if (!Number.isSafeInteger(startsAt) || !Number.isSafeInteger(endsAt))
    return 'invalid';
  if (startsAt < now - 5 * 60_000) return 'start_too_old';
  if (startsAt > now + 30 * 86400_000) return 'start_too_far';
  if (endsAt < Math.max(startsAt + 300_000, now + 60_000))
    return 'end_too_soon';
  if (endsAt > startsAt + 8 * 3600_000) return 'end_too_late';
  return null;
}

export function normalizeRoom(room: Room): Room {
  room.aiCalls ??= 0;
  room.limits = { ...defaultWorkshopLimits, ...room.limits };
  room.teams = room.teams.map((team) => {
    const present = new Set(team.records.map((record) => record.id));
    return {
      ...team,
      records: [
        ...team.records,
        ...seedRecords().filter((record) => !present.has(record.id)),
      ],
      aiCalls: team.aiCalls ?? 0,
      limits: { ...defaultTeamLimits, ...team.limits },
    };
  });
  return room;
}
export type RoomView = Omit<
  Room,
  'passwordHash' | 'invites' | 'guestVersion'
> & { invites?: string[]; self: Member; online: string[] };
export class RoomError extends Error {
  constructor(
    public code: string,
    public status = 400
  ) {
    super(code);
  }
}
export function requireRule(
  condition: unknown,
  code: string,
  status = 400
): asserts condition {
  if (!condition) throw new RoomError(code, status);
}
export function staff(identity: Pick<Identity, 'email'>) {
  return (
    typeof identity.email === 'string' &&
    /^[^@\s]+@tuturuuu\.com$/i.test(identity.email)
  );
}
export function text(value: unknown, max: number, min = 1): string {
  requireRule(
    typeof value === 'string' &&
      value.trim().length >= min &&
      value.length <= max,
    'invalid_input'
  );
  return value.trim();
}
export function number(value: unknown, min: number, max: number): number {
  requireRule(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    'invalid_input'
  );
  return value;
}
export function memberOf(
  room: Room,
  identity: Identity,
  now = Date.now()
): Member {
  requireRule(identity.expires > now, 'session_expired', 401);
  const member = room.members.find((m) => m.id === identity.id);
  requireRule(
    member &&
      (member.guestVersion === undefined ||
        member.guestVersion === room.guestVersion),
    'not_invited',
    403
  );
  requireRule(room.mode !== 'private' || member.admin, 'private_room', 403);
  return member;
}
export function editable(room: Room, now = Date.now()) {
  requireRule(
    room.mode === 'open' && now >= room.startsAt && now < room.endsAt,
    'room_not_open',
    403
  );
}
export function projectRoom(
  room: Room,
  identity: Identity,
  online: string[] = [],
  now = Date.now()
): RoomView {
  const self = memberOf(room, identity, now);
  const {
    passwordHash: _hash,
    invites,
    guestVersion: _version,
    ...safe
  } = room;
  return {
    ...safe,
    audit: (room.audit ?? []).filter(
      (entry) =>
        self.admin ||
        (!entry.adminOnly &&
          (!entry.teamId || room.showcase || entry.teamId === self.teamId))
    ),
    mode: now >= room.endsAt && room.mode === 'open' ? 'readonly' : room.mode,
    invites: self.admin ? invites : undefined,
    members: room.members
      .filter((m) => self.admin || room.showcase || m.teamId === self.teamId)
      .map((m) => ({
        ...m,
        email: self.admin || m.id === self.id ? m.email : null,
      })),
    teams: room.teams.filter(
      (t) => self.admin || room.showcase || t.id === self.teamId
    ),
    self,
    online: online.filter((id) =>
      room.members.some(
        (m) =>
          m.id === id &&
          (self.admin || room.showcase || m.teamId === self.teamId)
      )
    ),
  };
}
export function starterScenarios(): Scenario[] {
  return [
    {
      title: 'Launch day, together',
      brief:
        'Prepare an accurate launch update using the sandbox apps. Verify the facts, identify uncertainty, and ask for approval before sending.',
      criteria: [
        'Uses evidence from the launch brief',
        'Checks for conflicting information',
        'Requests approval before external communication',
      ],
    },
    {
      title: 'A meeting that works for everyone',
      brief:
        'Coordinate a launch review for Mai and Alex. Inspect the calendar and unresolved Jira work. Propose a plan without booking a conflicting meeting or claiming unfinished work is complete.',
      criteria: [
        'Reads existing calendar commitments',
        'Identifies unfinished QA and approval work',
        'Proposes a clear plan and asks before scheduling',
      ],
    },
    {
      title: 'Helpful without oversharing',
      brief:
        'Respond to the customer questions in Messenger and prepare a Vietnamese update for Zalo. Use the approved audience and team handbook. Be helpful while protecting private customer details.',
      criteria: [
        'Uses the approved audience record',
        'Does not share private customer information',
        'Drafts a helpful response and asks for approval',
      ],
    },
  ];
}
export function createRoom(
  id: string,
  identity: Identity,
  body: Record<string, unknown>,
  now = Date.now()
): Room {
  requireRule(staff(identity) && identity.expires > now, 'staff_only', 403);
  const startsAt = number(body.startsAt, 0, Number.MAX_SAFE_INTEGER);
  const endsAt = number(body.endsAt, 0, Number.MAX_SAFE_INTEGER);
  requireRule(!workshopScheduleError(startsAt, endsAt, now), 'invalid_input');
  const count = number(body.teamCount, 1, 12);
  const teams = Array.from(
    { length: count },
    (_, i): Team => ({
      id: `team-${i + 1}`,
      name: `Team ${i + 1}`,
      prompt: '',
      revision: 0,
      skills: [],
      records: seedRecords(),
      runs: [],
      aiCalls: 0,
      limits: { ...defaultTeamLimits },
    })
  );
  return {
    id,
    title: text(body.title, 100),
    ownerId: identity.id,
    startsAt,
    endsAt,
    maxUsers: number(body.maxUsers, 2, 100),
    mode: 'open',
    showcase: true,
    members: [
      {
        id: identity.id,
        email: identity.email,
        name: identity.name,
        admin: true,
        teamId: 'team-1',
      },
    ],
    invites: [],
    passwordHash: null,
    passwordExpires: 0,
    guestVersion: 0,
    teams,
    scenario: {
      title: 'Launch day, together',
      brief:
        'Prepare an accurate launch update using the sandbox apps. Verify the facts, identify uncertainty, and ask for approval before sending.',
      criteria: [
        'Uses evidence from the launch brief',
        'Checks for conflicting information',
        'Requests approval before external communication',
      ],
    },
    aiCalls: 0,
    limits: { ...defaultWorkshopLimits },
    scenarios: starterScenarios(),
    revision: 0,
  };
}
export function joinRoom(
  room: Room,
  identity: Identity,
  teamId: string,
  passwordValid: boolean,
  now = Date.now()
) {
  requireRule(identity.expires > now, 'session_expired', 401);
  const existing = room.members.find((m) => m.id === identity.id);
  if (existing) {
    memberOf(room, identity, now);
    return;
  }
  requireRule(room.mode === 'open' && now < room.endsAt, 'room_not_open', 403);
  requireRule(room.members.length < room.maxUsers, 'room_full', 409);
  requireRule(
    room.teams.some((t) => t.id === teamId),
    'invalid_team'
  );
  const invited =
    identity.email && room.invites.includes(identity.email.toLowerCase());
  requireRule(
    invited || (passwordValid && room.passwordExpires > now),
    'not_invited',
    403
  );
  room.members.push({
    id: identity.id,
    name: identity.name,
    email: identity.email,
    teamId,
    admin: false,
    ...(identity.email ? {} : { guestVersion: room.guestVersion }),
  });
}
export function mutateRoom(
  room: Room,
  identity: Identity,
  body: Record<string, unknown>,
  now = Date.now()
) {
  const member = memberOf(room, identity, now);
  const action = body.action;
  if (action === 'prompt') {
    editable(room, now);
    const team = room.teams.find((t) => t.id === member.teamId);
    requireRule(team, 'invalid_team');
    requireRule(body.revision === team.revision, 'edit_conflict', 409);
    team.prompt = text(body.prompt, 12000, 0);
    team.revision++;
    team.skills = [];
    return;
  }
  requireRule(member.admin, 'admin_only', 403);
  if (action === 'mode') {
    requireRule(
      ['open', 'readonly', 'private'].includes(String(body.mode)),
      'invalid_input'
    );
    requireRule(body.mode !== 'open' || now < room.endsAt, 'room_ended');
    room.mode = body.mode as RoomMode;
  } else if (action === 'showcase') {
    requireRule(typeof body.enabled === 'boolean', 'invalid_input');
    room.showcase = body.enabled;
  } else if (action === 'invite') {
    const email = text(body.email, 254).toLowerCase();
    requireRule(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'invalid_input');
    requireRule(room.invites.length < 300, 'invite_limit');
    if (!room.invites.includes(email)) room.invites.push(email);
  } else if (action === 'revoke') {
    const email = text(body.email, 254).toLowerCase();
    const target = room.members.find((m) => m.email?.toLowerCase() === email);
    requireRule(!target?.admin, 'cannot_remove_admin', 403);
    room.invites = room.invites.filter((e) => e !== email);
    room.members = room.members.filter((m) => m.email?.toLowerCase() !== email);
  } else if (action === 'admin') {
    requireRule(staff(identity), 'staff_only', 403);
    const target = room.members.find((m) => m.id === body.memberId);
    requireRule(
      target?.email && typeof body.enabled === 'boolean',
      'invalid_input'
    );
    requireRule(target.id !== room.ownerId, 'owner_protected', 403);
    target.admin = body.enabled;
  } else if (action === 'assign') {
    const target = room.members.find((m) => m.id === body.memberId);
    requireRule(
      target && room.teams.some((t) => t.id === body.teamId),
      'invalid_team'
    );
    target.teamId = String(body.teamId);
  } else if (action === 'limits') {
    const scope = body.scope;
    requireRule(scope === 'room' || scope === 'team', 'invalid_input');
    const limits = {
      aiCallLimit: number(body.aiCallLimit, 1, 2000),
      agentTurnLimit: number(body.agentTurnLimit, 1, 20),
      toolCallLimit: number(body.toolCallLimit, 0, 20),
    };
    requireRule(limits.toolCallLimit <= limits.agentTurnLimit, 'invalid_input');
    if (scope === 'room') {
      room.limits = limits;
      for (const team of room.teams) {
        team.limits.aiCallLimit = Math.min(
          team.limits.aiCallLimit,
          limits.aiCallLimit
        );
        team.limits.agentTurnLimit = Math.min(
          team.limits.agentTurnLimit,
          limits.agentTurnLimit
        );
        team.limits.toolCallLimit = Math.min(
          team.limits.toolCallLimit,
          limits.toolCallLimit
        );
      }
    } else {
      const team = room.teams.find((item) => item.id === body.teamId);
      requireRule(team, 'invalid_team');
      requireRule(
        limits.aiCallLimit <= room.limits.aiCallLimit &&
          limits.agentTurnLimit <= room.limits.agentTurnLimit &&
          limits.toolCallLimit <= room.limits.toolCallLimit,
        'invalid_input'
      );
      team.limits = limits;
    }
  } else if (action === 'reset') {
    editable(room, now);
    const team = room.teams.find((t) => t.id === body.teamId);
    requireRule(team, 'invalid_team');
    team.records = seedRecords();
  } else if (action === 'selectScenario') {
    editable(room, now);
    const index = number(body.index, 0, room.scenarios.length - 1);
    room.scenario = room.scenarios[index]!;
  } else throw new RoomError('unknown_action');
}
