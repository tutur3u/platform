import {
  defaultTeamLimits,
  defaultWorkshopLimits,
  maximumWorkshopLimits,
  normalizeStoredLimits,
  type TeamLimits,
  type WorkshopLimits,
  type WorkshopScheduleError,
} from './limits';
import { type MockRecord, seedRecords } from './mock-catalog';
import type { PromptReview } from './prompt-review';
import type { Run } from './run';

export {
  type PromptFramework,
  type PromptReview,
  promptFrameworks,
} from './prompt-review';

import { riseInductionScenario } from './rise-induction';
import { starterScenarios } from './rise-scenarios';

export * from './limits';
export type { MockApp, MockAppKind, MockRecord } from './mock-catalog';
export { mockAppCatalog, mockApps, seedRecords } from './mock-catalog';
export { starterScenarios } from './rise-scenarios';
export type {
  Run,
  RunStopReason,
  RunUsage,
  Trace,
  TraceStatus,
} from './run';

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
  teamIds: string[];
  admin: boolean;
  guestVersion?: number;
};
export type Skill = { name: string; description: string; markdown: string };
export type Team = {
  promptReview?: PromptReview;
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
export type Scenario = {
  id: string;
  title: string;
  brief: string;
  criteria: string[];
};
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
  sponsorship?: {
    credits: number;
    calls: number;
    receipts: {
      requestId: string;
      runId: string;
      credits: number;
      operation: string;
      teamId: string;
      at: number;
    }[];
  };
  audit?: AuditEntry[];
  id: string;
  title: string;
  ownerId: string;
  startsAt: number | null;
  endsAt: number | null;
  maxUsers: number;
  mode: RoomMode;
  showcase: boolean;
  showcaseTeamId: string | null;
  members: Member[];
  invites: string[];
  passwordHash: string | null;
  passwordExpires: number;
  guestVersion: number;
  directoryMemberIds: string[];
  teams: Team[];
  scenario: Scenario;
  scenarios: Scenario[];
  aiCalls: number;
  limits: WorkshopLimits;
  revision: number;
};

export function workshopScheduleError(
  startsAt: number | null,
  endsAt: number | null,
  now = Date.now(),
  allowPastStart = false
): WorkshopScheduleError | null {
  if (
    (startsAt !== null && !Number.isSafeInteger(startsAt)) ||
    (endsAt !== null && !Number.isSafeInteger(endsAt))
  )
    return 'invalid';
  if (!allowPastStart && startsAt !== null && startsAt < now - 5 * 60_000)
    return 'start_too_old';
  if (startsAt !== null && startsAt > now + 30 * 86400_000)
    return 'start_too_far';
  if (
    endsAt !== null &&
    endsAt < Math.max((startsAt ?? now) + 300_000, now + 60_000)
  )
    return 'end_too_soon';
  if (endsAt !== null && endsAt > (startsAt ?? now) + 8 * 3600_000)
    return 'end_too_late';
  return null;
}

export function normalizeRoom(room: Room): Room {
  room.aiCalls ??= 0;
  room.limits = normalizeStoredLimits(room.limits, defaultWorkshopLimits);
  room.directoryMemberIds ??= room.members
    .filter((member) => member.email)
    .map((member) => member.id);
  const validTeamIds = new Set(room.teams.map((team) => team.id));
  room.members = room.members.map((member) => {
    const storedTeamIds = (member as Member & { teamIds?: string[] }).teamIds;
    const teamIds = [
      ...new Set(
        (storedTeamIds?.length ? storedTeamIds : [member.teamId]).filter(
          (teamId) => validTeamIds.has(teamId)
        )
      ),
    ];
    const fallbackTeamId = room.teams[0]?.id;
    if (!teamIds.length && fallbackTeamId) teamIds.push(fallbackTeamId);
    const teamId = teamIds.includes(member.teamId)
      ? member.teamId
      : (teamIds[0] ?? member.teamId);
    return { ...member, teamId, teamIds, admin: member.admin && staff(member) };
  });
  room.showcaseTeamId = room.teams.some(
    (team) => team.id === room.showcaseTeamId
  )
    ? room.showcaseTeamId
    : (room.teams[0]?.id ?? null);
  const storedScenario = room.scenario as Scenario & { id?: string };
  const storedScenarios = (room as Room & { scenarios?: Scenario[] }).scenarios;
  const scenarioSource = storedScenarios?.length
    ? storedScenarios
    : [...starterScenarios(), storedScenario].filter(
        (scenario, index, candidates) =>
          candidates.findIndex(
            (candidate) =>
              candidate.title === scenario.title &&
              candidate.brief === scenario.brief
          ) === index
      );
  const availableScenarios = scenarioSource.some(
    (scenario) => scenario.id === riseInductionScenario.id
  )
    ? scenarioSource
    : [...scenarioSource, structuredClone(riseInductionScenario)];
  const scenarios = availableScenarios.map((scenario, index) => ({
    ...scenario,
    id: scenario.id ?? `legacy-scenario-${index + 1}`,
  }));
  const selected = scenarios.find(
    (scenario) =>
      (storedScenario.id && scenario.id === storedScenario.id) ||
      (scenario.title === storedScenario.title &&
        scenario.brief === storedScenario.brief)
  );
  room.scenarios = scenarios;
  room.scenario = selected ?? scenarios[0]!;
  const catalog = seedRecords();
  room.teams = room.teams.map((team) => {
    const present = new Set(team.records.map((record) => record.id));
    const limits = normalizeStoredLimits(
      team.limits,
      defaultTeamLimits,
      room.limits
    );
    return {
      ...team,
      records: [
        ...team.records,
        ...catalog
          .filter((record) => !present.has(record.id))
          .map((record) => ({ ...record })),
      ],
      aiCalls: team.aiCalls ?? 0,
      limits,
    };
  });
  return room;
}
export type RoomView = Omit<
  Room,
  'passwordHash' | 'invites' | 'guestVersion' | 'directoryMemberIds'
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
  const effective = { ...member, admin: member.admin && staff(identity) };
  requireRule(room.mode !== 'private' || effective.admin, 'private_room', 403);
  return effective;
}
export function editable(room: Room, now = Date.now()) {
  requireRule(
    room.mode === 'open' &&
      (room.startsAt === null || now >= room.startsAt) &&
      (room.endsAt === null || now < room.endsAt),
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
  const selfTeamIds = memberTeamIds(self);
  const {
    passwordHash: _hash,
    invites,
    guestVersion: _version,
    directoryMemberIds: _directoryMemberIds,
    ...safe
  } = room;
  return {
    ...safe,
    sponsorship: room.sponsorship
      ? {
          ...room.sponsorship,
          receipts: self.admin ? room.sponsorship.receipts : [],
        }
      : undefined,
    audit: (room.audit ?? []).filter(
      (entry) =>
        self.admin ||
        (!entry.adminOnly &&
          (!entry.teamId ||
            room.showcase ||
            selfTeamIds.includes(entry.teamId)))
    ),
    mode:
      room.endsAt !== null && now >= room.endsAt && room.mode === 'open'
        ? 'readonly'
        : room.mode,
    invites: self.admin ? invites : undefined,
    members: room.members
      .filter(
        (m) =>
          self.admin ||
          room.showcase ||
          memberTeamIds(m).some((teamId) => selfTeamIds.includes(teamId))
      )
      .map((m) => ({
        ...m,
        email: self.admin || m.id === self.id ? m.email : null,
      })),
    teams: room.teams.filter(
      (t) => self.admin || room.showcase || selfTeamIds.includes(t.id)
    ),
    self,
    online: online.filter((id) =>
      room.members.some(
        (m) =>
          m.id === id &&
          (self.admin ||
            room.showcase ||
            memberTeamIds(m).some((teamId) => selfTeamIds.includes(teamId)))
      )
    ),
  };
}
export function memberTeamIds(member: Pick<Member, 'teamId' | 'teamIds'>) {
  return member.teamIds?.length ? member.teamIds : [member.teamId];
}
export function createRoom(
  id: string,
  identity: Identity,
  body: Record<string, unknown>,
  now = Date.now()
): Room {
  requireRule(staff(identity) && identity.expires > now, 'staff_only', 403);
  const startsAt =
    body.startsAt === null
      ? null
      : number(body.startsAt, 0, Number.MAX_SAFE_INTEGER);
  const endsAt =
    body.endsAt === null
      ? null
      : number(body.endsAt, 0, Number.MAX_SAFE_INTEGER);
  requireRule(!workshopScheduleError(startsAt, endsAt, now), 'invalid_input');
  const count = number(body.teamCount, 1, 12);
  const riseTeams = [
    'Marketing & Growth',
    'Product & Development',
    'External Relations',
    'People & Culture',
  ];
  const teams = Array.from(
    { length: count },
    (_, i): Team => ({
      id: `team-${i + 1}`,
      name: riseTeams[i] ?? `Team ${i + 1}`,
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
    showcaseTeamId: teams[0]?.id ?? null,
    members: [
      {
        id: identity.id,
        email: identity.email,
        name: identity.name,
        admin: true,
        teamId: 'team-1',
        teamIds: ['team-1'],
      },
    ],
    invites: [],
    passwordHash: null,
    passwordExpires: 0,
    guestVersion: 0,
    directoryMemberIds: [identity.id],
    teams,
    scenario: starterScenarios()[0]!,
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
  requireRule(room.mode !== 'private', 'private_room', 403);
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
    teamIds: [teamId],
    admin: false,
    ...(identity.email ? {} : { guestVersion: room.guestVersion }),
  });
  if (identity.email && !room.directoryMemberIds.includes(identity.id))
    room.directoryMemberIds.push(identity.id);
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
    const requestedTeamId = String(body.teamId ?? member.teamId);
    requireRule(
      member.admin || memberTeamIds(member).includes(requestedTeamId),
      'invalid_team',
      403
    );
    const team = room.teams.find((t) => t.id === requestedTeamId);
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
    requireRule(
      body.mode !== 'open' || room.endsAt === null || now < room.endsAt,
      'room_ended'
    );
    room.mode = body.mode as RoomMode;
  } else if (action === 'showcase') {
    requireRule(typeof body.enabled === 'boolean', 'invalid_input');
    room.showcase = body.enabled;
  } else if (action === 'showcaseTeam') {
    const team = room.teams.find((item) => item.id === body.teamId);
    requireRule(team, 'invalid_team');
    room.showcaseTeamId = team.id;
  } else if (action === 'schedule') {
    const startsAt =
      body.startsAt === null
        ? null
        : number(body.startsAt, 0, Number.MAX_SAFE_INTEGER);
    const endsAt =
      body.endsAt === null
        ? null
        : number(body.endsAt, 0, Number.MAX_SAFE_INTEGER);
    requireRule(
      !workshopScheduleError(startsAt, endsAt, now, true),
      'invalid_input'
    );
    room.startsAt = startsAt;
    room.endsAt = endsAt;
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
    requireRule(body.enabled !== true || staff(target), 'staff_only', 403);
    target.admin = body.enabled;
  } else if (action === 'assign') {
    const target = room.members.find((m) => m.id === body.memberId);
    requireRule(
      target && room.teams.some((t) => t.id === body.teamId),
      'invalid_team'
    );
    target.teamId = String(body.teamId);
    if (!memberTeamIds(target).includes(target.teamId))
      target.teamIds = [...memberTeamIds(target), target.teamId];
  } else if (action === 'membership') {
    const target = room.members.find((m) => m.id === body.memberId);
    const team = room.teams.find((item) => item.id === body.teamId);
    requireRule(
      target && team && typeof body.enabled === 'boolean',
      'invalid_team'
    );
    const memberships = memberTeamIds(target);
    if (body.enabled) {
      target.teamIds = [...new Set([...memberships, team.id])];
    } else {
      requireRule(memberships.length > 1, 'last_membership', 409);
      target.teamIds = memberships.filter((teamId) => teamId !== team.id);
      if (target.teamId === team.id) target.teamId = target.teamIds[0]!;
    }
  } else if (action === 'teamCreate') {
    requireRule(room.teams.length < 12, 'team_limit', 409);
    room.teams.push({
      id: `team-${crypto.randomUUID().slice(0, 8)}`,
      name: text(body.name, 60),
      prompt: '',
      revision: 0,
      skills: [],
      records: seedRecords(),
      runs: [],
      aiCalls: 0,
      limits: {
        aiCallLimit: Math.min(
          defaultTeamLimits.aiCallLimit,
          room.limits.aiCallLimit
        ),
        agentTurnLimit: Math.min(
          defaultTeamLimits.agentTurnLimit,
          room.limits.agentTurnLimit
        ),
        toolCallLimit: Math.min(
          defaultTeamLimits.toolCallLimit,
          room.limits.toolCallLimit
        ),
      },
    });
  } else if (action === 'teamRename') {
    const team = room.teams.find((item) => item.id === body.teamId);
    requireRule(team, 'invalid_team');
    team.name = text(body.name, 60);
  } else if (action === 'teamDelete') {
    requireRule(room.teams.length > 1, 'last_team', 409);
    const team = room.teams.find((item) => item.id === body.teamId);
    requireRule(team, 'invalid_team');
    const fallback = room.teams.find((item) => item.id !== team.id)!;
    for (const target of room.members) {
      target.teamIds = memberTeamIds(target).filter(
        (teamId) => teamId !== team.id
      );
      if (!target.teamIds.length) target.teamIds = [fallback.id];
      if (target.teamId === team.id) target.teamId = target.teamIds[0]!;
    }
    room.teams = room.teams.filter((item) => item.id !== team.id);
    if (room.showcaseTeamId === team.id) room.showcaseTeamId = fallback.id;
  } else if (action === 'memberRemove') {
    const target = room.members.find((item) => item.id === body.memberId);
    requireRule(target, 'invalid_input');
    requireRule(target.id !== room.ownerId, 'owner_protected', 403);
    room.members = room.members.filter((item) => item.id !== target.id);
    if (target.email)
      room.invites = room.invites.filter(
        (email) => email !== target.email?.toLowerCase()
      );
  } else if (action === 'limits') {
    const scope = body.scope;
    requireRule(scope === 'room' || scope === 'team', 'invalid_input');
    const limits = {
      aiCallLimit: number(
        body.aiCallLimit,
        1,
        maximumWorkshopLimits.aiCallLimit
      ),
      agentTurnLimit: number(
        body.agentTurnLimit,
        2,
        maximumWorkshopLimits.agentTurnLimit
      ),
      toolCallLimit: number(
        body.toolCallLimit,
        0,
        maximumWorkshopLimits.toolCallLimit
      ),
    };
    requireRule(limits.toolCallLimit < limits.agentTurnLimit, 'invalid_input');
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
    const scenario = room.scenarios.find((item) => item.id === body.scenarioId);
    requireRule(scenario, 'invalid_input');
    room.scenario = scenario;
  } else throw new RoomError('unknown_action');
}
