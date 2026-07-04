import type {
  RateLimitAppeal,
  RateLimitEdgeBucket,
  RateLimitRecommendedAction,
  RateLimitResolvedSubjectKind,
  RateLimitRule,
  RateLimitSubjectResolution,
  RateLimitSubjectSearchKind,
  RateLimitSubjectSearchResult,
  RateLimitUsageDisplay,
  RateLimitUserSummary,
  RateLimitWorkspaceSummary,
  RateLimitWriteCounter,
} from '@tuturuuu/internal-api';

type SupabaseLike = {
  from: (table: string) => any;
};

type ParsedSubject = {
  id: string | null;
  ip: string | null;
  kind: RateLimitResolvedSubjectKind;
  subjectKey: string;
  technicalKey: string;
  userId: string | null;
  workspaceId: string | null;
};

type WorkspaceRow = {
  avatar_url?: string | null;
  handle?: string | null;
  id: string;
  name?: string | null;
  personal?: boolean | null;
};

type UserRow = {
  avatar_url?: string | null;
  display_name?: string | null;
  handle?: string | null;
  id: string;
};

type UserPrivateRow = {
  email?: string | null;
  full_name?: string | null;
  user_id: string;
};

type BlockedIpRow = {
  id: string;
  ip_address: string;
};

type WorkspaceMemberRow = {
  type?: string | null;
  user_id: string;
  ws_id: string;
};

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/u;

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.filter(Boolean).map((value) => value!.trim()))];
}

function shortId(value: string | null | undefined) {
  if (!value) return null;
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function capitalizeWords(value: string | null | undefined) {
  return (value ?? '')
    .split(/[-_:]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function splitFirst(value: string, separator = ':') {
  const index = value.indexOf(separator);
  if (index < 0) return [value, ''] as const;
  return [
    value.slice(0, index),
    value.slice(index + separator.length),
  ] as const;
}

function normalizeSubjectPrefix(type?: string | null) {
  return type === 'user_location' ? 'user-location' : type;
}

export function parseRateLimitSubjectKey(
  technicalKey: string,
  subjectType?: string | null
): ParsedSubject {
  const key = technicalKey.trim();
  const typePrefix = normalizeSubjectPrefix(subjectType);

  if (key.startsWith('workspace:')) {
    const id = clean(key.slice('workspace:'.length))?.toLowerCase() ?? null;
    return {
      id,
      ip: null,
      kind: 'workspace',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: UUID_PATTERN.test(id ?? '') ? id : null,
    };
  }

  if (key.startsWith('user-location:')) {
    const [userId, ip] = splitFirst(key.slice('user-location:'.length));
    return {
      id: clean(userId)?.toLowerCase() ?? null,
      ip: clean(ip),
      kind: 'user_location',
      subjectKey: key,
      technicalKey: key,
      userId: UUID_PATTERN.test(userId) ? userId.toLowerCase() : clean(userId),
      workspaceId: null,
    };
  }

  if (key.startsWith('user-ip:')) {
    const [userId, ip] = splitFirst(key.slice('user-ip:'.length));
    return {
      id: clean(userId)?.toLowerCase() ?? null,
      ip: clean(ip),
      kind: 'user_location',
      subjectKey: key,
      technicalKey: key,
      userId: UUID_PATTERN.test(userId) ? userId.toLowerCase() : clean(userId),
      workspaceId: null,
    };
  }

  if (key.startsWith('user:')) {
    const id = clean(key.slice('user:'.length))?.toLowerCase() ?? null;
    return {
      id,
      ip: null,
      kind: 'user',
      subjectKey: key,
      technicalKey: key,
      userId: UUID_PATTERN.test(id ?? '') ? id : null,
      workspaceId: null,
    };
  }

  if (key.startsWith('anonymous-role-ip:')) {
    const [, ip] = splitFirst(key.slice('anonymous-role-ip:'.length));
    return {
      id: clean(ip),
      ip: clean(ip),
      kind: 'ip',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  if (key.startsWith('ip:')) {
    const ip = clean(key.slice('ip:'.length));
    return {
      id: ip,
      ip,
      kind: 'ip',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  if (key.startsWith('cidr:')) {
    const id = clean(key.slice('cidr:'.length));
    return {
      id,
      ip: null,
      kind: 'cidr',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  if (key.startsWith('session:')) {
    const id = clean(key.slice('session:'.length));
    return {
      id,
      ip: null,
      kind: 'session',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  if (key.startsWith('api-key:')) {
    const id = clean(key.slice('api-key:'.length));
    return {
      id,
      ip: null,
      kind: 'api_key',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  if (typePrefix && key.startsWith(`${typePrefix}:`)) {
    const id = clean(key.slice(typePrefix.length + 1));
    return {
      id,
      ip: null,
      kind: (subjectType as RateLimitResolvedSubjectKind) ?? 'unknown',
      subjectKey: key,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  if (IPV4_PATTERN.test(key)) {
    return {
      id: key,
      ip: key,
      kind: 'ip',
      subjectKey: `ip:${key}`,
      technicalKey: key,
      userId: null,
      workspaceId: null,
    };
  }

  return {
    id: null,
    ip: null,
    kind: 'unknown',
    subjectKey: key,
    technicalKey: key,
    userId: null,
    workspaceId: null,
  };
}

async function loadWorkspaceMap(client: SupabaseLike, workspaceIds: string[]) {
  if (workspaceIds.length === 0)
    return new Map<string, RateLimitWorkspaceSummary>();

  try {
    const { data } = await client
      .from('workspaces')
      .select('id,name,handle,avatar_url,personal')
      .in('id', workspaceIds);

    return new Map(
      ((data ?? []) as WorkspaceRow[]).map((row) => [
        row.id,
        {
          avatarUrl: row.avatar_url ?? null,
          handle: row.handle ?? null,
          id: row.id,
          name: row.name ?? null,
          personal: row.personal ?? null,
        } satisfies RateLimitWorkspaceSummary,
      ])
    );
  } catch {
    return new Map<string, RateLimitWorkspaceSummary>();
  }
}

async function loadUserMap(client: SupabaseLike, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, RateLimitUserSummary>();

  try {
    const [usersResult, privateResult] = await Promise.all([
      client
        .from('users')
        .select('id,display_name,handle,avatar_url')
        .in('id', userIds),
      client
        .from('user_private_details')
        .select('user_id,email,full_name')
        .in('user_id', userIds),
    ]);

    const privateById = new Map(
      ((privateResult.data ?? []) as UserPrivateRow[]).map((row) => [
        row.user_id,
        row,
      ])
    );

    return new Map(
      ((usersResult.data ?? []) as UserRow[]).map((row) => {
        const privateRow = privateById.get(row.id);
        return [
          row.id,
          {
            avatarUrl: row.avatar_url ?? null,
            displayName:
              clean(row.display_name) ?? clean(privateRow?.full_name) ?? null,
            email: privateRow?.email ?? null,
            handle: row.handle ?? null,
            id: row.id,
          } satisfies RateLimitUserSummary,
        ];
      })
    );
  } catch {
    return new Map<string, RateLimitUserSummary>();
  }
}

function buildResolution(
  parsed: ParsedSubject,
  workspaces: Map<string, RateLimitWorkspaceSummary>,
  users: Map<string, RateLimitUserSummary>
): RateLimitSubjectResolution {
  const workspace =
    parsed.workspaceId != null ? workspaces.get(parsed.workspaceId) : null;
  const user = parsed.userId != null ? users.get(parsed.userId) : null;

  if (workspace) {
    return {
      ...parsed,
      confidence: 'verified',
      detail: workspace.handle
        ? `@${workspace.handle} · ${workspace.id}`
        : workspace.id,
      label: workspace.name || `Workspace ${shortId(workspace.id)}`,
      verified: true,
    };
  }

  if (user) {
    const label =
      clean(user.displayName) ??
      clean(user.email) ??
      (user.handle ? `@${user.handle}` : null) ??
      `User ${shortId(user.id)}`;
    const detailParts = [
      user.email,
      user.handle ? `@${user.handle}` : null,
      user.id,
    ]
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index);

    return {
      ...parsed,
      confidence: 'verified',
      detail: detailParts.join(' · '),
      label: parsed.ip ? `${label} from ${parsed.ip}` : label,
      verified: true,
    };
  }

  if (parsed.kind === 'ip' && parsed.ip) {
    return {
      ...parsed,
      confidence: 'parsed',
      detail: 'Network address',
      label: `IP ${parsed.ip}`,
      verified: false,
    };
  }

  if (parsed.kind === 'cidr' && parsed.id) {
    return {
      ...parsed,
      confidence: 'parsed',
      detail: 'Network range',
      label: `CIDR ${parsed.id}`,
      verified: false,
    };
  }

  if (parsed.kind === 'session' && parsed.id) {
    return {
      ...parsed,
      confidence: 'parsed',
      detail: parsed.id,
      label: `Session ${shortId(parsed.id)}`,
      verified: false,
    };
  }

  if (parsed.kind === 'api_key' && parsed.id) {
    return {
      ...parsed,
      confidence: 'parsed',
      detail: parsed.id,
      label: `API key ${shortId(parsed.id)}`,
      verified: false,
    };
  }

  if (parsed.kind === 'workspace' && parsed.workspaceId) {
    return {
      ...parsed,
      confidence: 'parsed',
      detail: parsed.workspaceId,
      label: `Workspace ${shortId(parsed.workspaceId)}`,
      verified: false,
    };
  }

  if (
    (parsed.kind === 'user' || parsed.kind === 'user_location') &&
    parsed.userId
  ) {
    return {
      ...parsed,
      confidence: 'parsed',
      detail: parsed.userId,
      label: parsed.ip
        ? `User ${shortId(parsed.userId)} from ${parsed.ip}`
        : `User ${shortId(parsed.userId)}`,
      verified: false,
    };
  }

  return {
    ...parsed,
    confidence: 'unknown',
    detail: parsed.technicalKey,
    label: 'Unknown subject',
    verified: false,
  };
}

export async function resolveRateLimitSubjects(
  client: SupabaseLike,
  subjects: { subjectKey: string; subjectType?: string | null }[]
) {
  const parsed = subjects.map((subject) =>
    parseRateLimitSubjectKey(subject.subjectKey, subject.subjectType)
  );
  const workspaceIds = unique(parsed.map((subject) => subject.workspaceId));
  const userIds = unique(parsed.map((subject) => subject.userId));
  const [workspaces, users] = await Promise.all([
    loadWorkspaceMap(client, workspaceIds),
    loadUserMap(client, userIds),
  ]);

  return new Map(
    parsed.map((subject) => [
      subject.technicalKey,
      buildResolution(subject, workspaces, users),
    ])
  );
}

export async function enrichRateLimitRules(
  client: SupabaseLike,
  rules: RateLimitRule[]
): Promise<RateLimitRule[]> {
  const resolutions = await resolveRateLimitSubjects(
    client,
    rules.map((rule) => ({
      subjectKey: rule.subject_key,
      subjectType: rule.subject_type,
    }))
  );

  return rules.map((rule) => ({
    ...rule,
    subject: resolutions.get(rule.subject_key),
  }));
}

function buildUsageDisplay(args: {
  action: string;
  subject: RateLimitSubjectResolution;
  technicalKey: string;
}): RateLimitUsageDisplay {
  return {
    action: args.action,
    subtitle: args.subject.detail,
    technicalKey: args.technicalKey,
    title: args.subject.label,
  };
}

export async function enrichRateLimitWriteCounters(
  client: SupabaseLike,
  counters: RateLimitWriteCounter[]
): Promise<RateLimitWriteCounter[]> {
  const resolutions = await resolveRateLimitSubjects(
    client,
    counters.map((counter) => ({ subjectKey: counter.bucket }))
  );

  return counters.map((counter) => {
    const subject = resolutions.get(counter.bucket);
    return {
      ...counter,
      display: subject
        ? buildUsageDisplay({
            action: 'Database write pressure',
            subject,
            technicalKey: counter.bucket,
          })
        : undefined,
      subject,
    };
  });
}

export async function enrichRateLimitEdgeBuckets(
  client: SupabaseLike,
  buckets: RateLimitEdgeBucket[]
): Promise<RateLimitEdgeBucket[]> {
  const resolutions = await resolveRateLimitSubjects(
    client,
    buckets.map((bucket) => ({ subjectKey: bucket.subject ?? bucket.key }))
  );

  return buckets.map((bucket) => {
    const subject = resolutions.get(bucket.subject ?? bucket.key);
    const actionParts = [
      capitalizeWords(bucket.policy),
      bucket.operation === 'mutate' ? 'Write' : 'Read',
      bucket.window ? `${bucket.window} window` : null,
    ].filter(Boolean);

    return {
      ...bucket,
      display: subject
        ? buildUsageDisplay({
            action: actionParts.join(' · ') || 'Edge traffic',
            subject,
            technicalKey: bucket.key,
          })
        : undefined,
      subjectResolution: subject,
    };
  });
}

function buildRecommendedActions(args: {
  activeBlock: boolean;
  hasWorkspace: boolean;
  membershipVerified: boolean;
}) {
  const workspaceDisabledReason = !args.hasWorkspace
    ? 'No workspace was captured with this appeal.'
    : !args.membershipVerified
      ? 'Requester is not verified as a member of this workspace.'
      : null;

  return [
    {
      createWorkspaceRule: true,
      description:
        'Clear the IP block and give this workspace 3x limits for 30 days.',
      disabledReason: workspaceDisabledReason,
      expiresInDays: 30,
      key: 'trusted_workspace',
      label: 'Approve trusted workspace',
      recommended: args.hasWorkspace && args.membershipVerified,
      requiresAdvancedOverride: !!workspaceDisabledReason,
      trustMultiplier: 3,
    },
    {
      createWorkspaceRule: true,
      description: 'Short event/classroom uplift: 5x limits for 7 days.',
      disabledReason: workspaceDisabledReason,
      expiresInDays: 7,
      key: 'event_or_classroom',
      label: 'Short event or classroom',
      recommended: false,
      requiresAdvancedOverride: !!workspaceDisabledReason,
      trustMultiplier: 5,
    },
    {
      createWorkspaceRule: true,
      description: 'Extended trusted workspace: 10x limits for 30 days.',
      disabledReason: workspaceDisabledReason,
      expiresInDays: 30,
      key: 'extended_trusted',
      label: 'Extended trusted workspace',
      recommended: false,
      requiresAdvancedOverride: !!workspaceDisabledReason,
      trustMultiplier: 10,
    },
    {
      createWorkspaceRule: false,
      description: args.activeBlock
        ? 'Clear the active IP block without changing rate limits.'
        : 'Close as approved without a workspace uplift.',
      disabledReason: null,
      expiresInDays: null,
      key: 'clear_ip_only',
      label: 'Clear IP only',
      recommended: args.activeBlock && !args.membershipVerified,
      requiresAdvancedOverride: false,
      trustMultiplier: null,
    },
  ] satisfies RateLimitRecommendedAction[];
}

export async function enrichRateLimitAppeals(
  client: SupabaseLike,
  appeals: RateLimitAppeal[]
): Promise<RateLimitAppeal[]> {
  const workspaceIds = unique(appeals.map((appeal) => appeal.workspace_id));
  const userIds = unique(appeals.map((appeal) => appeal.creator_id));
  const ips = unique(appeals.map((appeal) => appeal.client_ip));

  const [workspaces, users, blocks, memberships] = await Promise.all([
    loadWorkspaceMap(client, workspaceIds),
    loadUserMap(client, userIds),
    loadActiveBlockedIpMap(client, ips),
    loadWorkspaceMembershipMap(client, workspaceIds, userIds),
  ]);

  return appeals.map((appeal) => {
    const workspace = appeal.workspace_id
      ? (workspaces.get(appeal.workspace_id) ?? null)
      : null;
    const requester = users.get(appeal.creator_id) ?? {
      avatarUrl: null,
      displayName: null,
      email: appeal.user_email,
      handle: null,
      id: appeal.creator_id,
    };
    const membership =
      appeal.workspace_id && appeal.creator_id
        ? memberships.get(`${appeal.workspace_id}:${appeal.creator_id}`)
        : null;
    const membershipVerified = !!membership;
    const activeBlockId = blocks.get(appeal.client_ip) ?? null;

    return {
      ...appeal,
      reviewContext: {
        activeBlock: {
          active: !!activeBlockId,
          blockedIpId: activeBlockId,
          label: activeBlockId ? 'Active IP block found' : 'No active IP block',
        },
        membership: {
          label: !appeal.workspace_id
            ? 'No workspace captured'
            : membershipVerified
              ? `Requester is a ${membership.type ?? 'member'}`
              : 'Requester is not verified in this workspace',
          status: !appeal.workspace_id
            ? 'not_applicable'
            : membershipVerified
              ? 'member'
              : 'not_member',
          type: membership?.type ?? null,
          verified: membershipVerified,
        },
        recommendedActions: buildRecommendedActions({
          activeBlock: !!activeBlockId,
          hasWorkspace: !!workspace,
          membershipVerified,
        }),
        requester,
        workspace,
      },
    };
  });
}

async function loadActiveBlockedIpMap(client: SupabaseLike, ips: string[]) {
  if (ips.length === 0) return new Map<string, string>();

  try {
    const { data } = await client
      .from('blocked_ips')
      .select('id,ip_address')
      .in('ip_address', ips)
      .eq('status', 'active');

    return new Map(
      ((data ?? []) as BlockedIpRow[]).map((row) => [row.ip_address, row.id])
    );
  } catch {
    return new Map<string, string>();
  }
}

async function loadWorkspaceMembershipMap(
  client: SupabaseLike,
  workspaceIds: string[],
  userIds: string[]
) {
  if (workspaceIds.length === 0 || userIds.length === 0) {
    return new Map<string, WorkspaceMemberRow>();
  }

  try {
    const { data } = await client
      .from('workspace_members')
      .select('ws_id,user_id,type')
      .in('ws_id', workspaceIds)
      .in('user_id', userIds);

    return new Map(
      ((data ?? []) as WorkspaceMemberRow[]).map((row) => [
        `${row.ws_id}:${row.user_id}`,
        row,
      ])
    );
  } catch {
    return new Map<string, WorkspaceMemberRow>();
  }
}

export async function verifyWorkspaceAppealMembership(args: {
  appeal: RateLimitAppeal;
  client: SupabaseLike;
  workspaceId: string;
}) {
  const [workspaceMap, membershipMap] = await Promise.all([
    loadWorkspaceMap(args.client, [args.workspaceId]),
    loadWorkspaceMembershipMap(
      args.client,
      [args.workspaceId],
      [args.appeal.creator_id]
    ),
  ]);
  const workspace = workspaceMap.get(args.workspaceId) ?? null;
  const membership =
    membershipMap.get(`${args.workspaceId}:${args.appeal.creator_id}`) ?? null;

  return {
    membership,
    membershipVerified: !!membership,
    workspace,
    workspaceExists: !!workspace,
  };
}

export async function searchRateLimitSubjectCandidates(args: {
  client: SupabaseLike;
  kind: RateLimitSubjectSearchKind;
  limit: number;
  q?: string;
}): Promise<RateLimitSubjectSearchResult[]> {
  const q = clean(args.q);

  if (args.kind === 'workspace') {
    let query = args.client
      .from('workspaces')
      .select('id,name,handle,personal')
      .order('name', { ascending: true })
      .limit(args.limit);

    if (q) {
      query = UUID_PATTERN.test(q)
        ? query.eq('id', q)
        : query.ilike('name', `%${q}%`);
    }

    const { data } = await query;
    return ((data ?? []) as WorkspaceRow[]).map((row) => ({
      detail: [row.handle ? `@${row.handle}` : null, row.id]
        .filter(Boolean)
        .join(' · '),
      kind: 'workspace',
      label: row.name || `Workspace ${shortId(row.id)}`,
      subjectKey: `workspace:${row.id}`,
      subjectType: 'workspace',
      value: row.id,
    }));
  }

  if (args.kind === 'user') {
    let query = args.client
      .from('users')
      .select('id,display_name,handle')
      .order('display_name', { ascending: true })
      .limit(args.limit);

    if (q) {
      query = UUID_PATTERN.test(q)
        ? query.eq('id', q)
        : query.ilike('display_name', `%${q}%`);
    }

    const { data } = await query;
    const users = await loadUserMap(
      args.client,
      ((data ?? []) as UserRow[]).map((row) => row.id)
    );

    return [...users.values()].map((user) => ({
      detail: [user.email, user.handle ? `@${user.handle}` : null, user.id]
        .filter(Boolean)
        .join(' · '),
      kind: 'user',
      label:
        clean(user.displayName) ??
        clean(user.email) ??
        (user.handle ? `@${user.handle}` : null) ??
        `User ${shortId(user.id)}`,
      subjectKey: `user:${user.id}`,
      subjectType: 'user',
      value: user.id,
    }));
  }

  let query = args.client
    .from('blocked_ips')
    .select('ip_address,status,blocked_at,reason')
    .order('blocked_at', { ascending: false })
    .limit(args.limit);

  if (q) {
    query = query.ilike('ip_address', `%${q}%`);
  }

  const { data } = await query;
  const results = (
    (data ?? []) as { ip_address: string; status?: string | null }[]
  ).map((row) => ({
    detail: row.status ? `Blocked IP · ${row.status}` : 'IP address',
    kind: 'ip' as const,
    label: `IP ${row.ip_address}`,
    subjectKey: `ip:${row.ip_address}`,
    subjectType: 'ip' as const,
    value: row.ip_address,
  }));

  if (q && IPV4_PATTERN.test(q) && !results.some((row) => row.value === q)) {
    results.unshift({
      detail: 'Typed IP address',
      kind: 'ip',
      label: `IP ${q}`,
      subjectKey: `ip:${q}`,
      subjectType: 'ip',
      value: q,
    });
  }

  return results.slice(0, args.limit);
}
