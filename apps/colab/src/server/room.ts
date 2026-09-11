import { DurableObject } from 'cloudflare:workers';
import {
  createRoom,
  editable,
  type Identity,
  joinRoom,
  memberOf,
  memberTeamIds,
  mutateRoom,
  normalizeRoom,
  projectRoom,
  type Room,
  RoomError,
  requireRule,
  text,
  type WorkshopSummary,
} from '@tuturuuu/multiplayer';
import { compileSkills, makeScenario, runAgent } from './ai';
import { hash, randomToken } from './auth';
import type { Env } from './env';
import { reviewPrompt } from './prompt-review';
import { RoomImages } from './room-images';
import { SponsorshipGrants } from './sponsorship-grants';

export class ColabRoom extends DurableObject<Env> {
  private grants: SponsorshipGrants;
  private images: RoomImages;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.grants = new SponsorshipGrants(ctx.storage);
    this.images = new RoomImages(ctx.storage);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)'
    );
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)'
    );
  }
  private read(): Room {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM state WHERE id = 1')
      .toArray()[0];
    requireRule(row, 'room_missing', 404);
    const room = normalizeRoom(JSON.parse(row.value) as Room);
    const audit = this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM state WHERE id = 2')
      .toArray()[0];
    room.audit = audit ? JSON.parse(audit.value) : [];
    return room;
  }
  private save(room: Room) {
    room.revision++;
    // Keep private audit data out of the legacy room JSON. Older Worker versions
    // spread unknown room fields into their projections during a rollback.
    const { audit, ...state } = room;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO state(id, value) VALUES(1, ?)',
        JSON.stringify(state)
      );
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO state(id, value) VALUES(2, ?)',
        JSON.stringify(audit ?? [])
      );
    });
    this.broadcast(room);
  }
  // Per-account index stores identifiers only; every list read rechecks room access.
  rememberRoom(id: string) {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS directory (id TEXT PRIMARY KEY, visited INTEGER NOT NULL)'
    );
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO directory VALUES (?, ?)',
      id,
      Date.now()
    );
  }
  roomIds() {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS directory (id TEXT PRIMARY KEY, visited INTEGER NOT NULL)'
    );
    return this.ctx.storage.sql
      .exec<{ id: string }>(
        'SELECT id FROM directory ORDER BY visited DESC LIMIT 100'
      )
      .toArray()
      .map((row) => row.id);
  }
  forgetRoom(id: string) {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS directory (id TEXT PRIMARY KEY, visited INTEGER NOT NULL)'
    );
    this.ctx.storage.sql.exec('DELETE FROM directory WHERE id = ?', id);
  }
  summary(identity: Identity): WorkshopSummary {
    const room = this.read();
    const self = memberOf(room, identity);
    return {
      id: room.id,
      title: room.title,
      startsAt: room.startsAt,
      endsAt: room.endsAt,
      mode:
        room.endsAt !== null &&
        Date.now() >= room.endsAt &&
        room.mode === 'open'
          ? 'readonly'
          : room.mode,
      showcase: room.showcase,
      maxUsers: room.maxUsers,
      memberCount: room.members.length,
      teamCount: room.teams.length,
      admin: self.admin,
    };
  }
  private record(
    room: Room,
    action: string,
    identity?: Identity,
    adminOnly = false,
    teamId?: string
  ) {
    const member = room.members.find((m) => m.id === identity?.id);
    room.audit = [
      ...(room.audit ?? []),
      {
        id: crypto.randomUUID(),
        at: Date.now(),
        actor: identity?.name ?? 'Colab',
        action,
        adminOnly,
        teamId: ['prompt', 'compile', 'run', 'limits'].includes(action)
          ? (teamId ?? member?.teamId)
          : undefined,
      },
    ].slice(-200);
  }
  async limit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM limits WHERE expires <= ?', now);
    const row = this.ctx.storage.sql
      .exec<{ count: number }>('SELECT count FROM limits WHERE key = ?', key)
      .toArray()[0];
    requireRule(!row || row.count < max, 'rate_limited', 429);
    this.ctx.storage.sql.exec(
      'INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
      key,
      now + windowMs
    );
  }
  async create(id: string, identity: Identity, body: Record<string, unknown>) {
    requireRule(
      !this.ctx.storage.sql.exec('SELECT id FROM state WHERE id = 1').toArray()
        .length,
      'room_exists',
      409
    );
    const room = createRoom(id, identity, body);
    // Schedule before writing, then recheck after the await to prevent duplicate initialization.
    if (room.endsAt !== null) await this.ctx.storage.setAlarm(room.endsAt);
    requireRule(
      !this.ctx.storage.sql.exec('SELECT id FROM state WHERE id = 1').toArray()
        .length,
      'room_exists',
      409
    );
    this.record(room, 'created', identity);
    this.save(room);
    return projectRoom(room, identity);
  }
  view(identity: Identity) {
    return projectRoom(this.read(), identity, this.online());
  }
  async delete(identity: Identity) {
    const room = this.read();
    const member = memberOf(room, identity);
    requireRule(member.id === room.ownerId, 'owner_only', 403);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ type: 'room_deleted' }));
        ws.close(1000, 'room_deleted');
      } catch {
        // A stale socket must not prevent the owner from deleting the workshop.
      }
    }
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM state');
      this.ctx.storage.sql.exec('DELETE FROM limits');
      this.images.clear();
    });
    return room.directoryMemberIds;
  }
  async join(
    identity: Identity,
    body: Record<string, unknown>,
    attemptKey: string
  ) {
    await this.limit(`join:${attemptKey}`, 20, 600_000);
    const suppliedHash =
      typeof body.password === 'string' && body.password.length <= 200
        ? await hash(body.password)
        : '';
    const room = this.read();
    joinRoom(
      room,
      identity,
      text(body.teamId, 30),
      Boolean(room.passwordHash && room.passwordHash === suppliedHash)
    );
    this.record(room, 'joined', identity, true);
    this.save(room);
    return {
      view: projectRoom(room, identity),
      guestVersion: room.guestVersion,
    };
  }
  async action(identity: Identity, body: Record<string, unknown>) {
    await this.limit(`action:${identity.id}`, 90, 60_000);
    const room = this.read();
    mutateRoom(room, identity, body);
    if (body.action === 'schedule') {
      if (room.endsAt === null) await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(room.endsAt);
    }
    this.record(
      room,
      String(body.action),
      identity,
      body.action !== 'prompt',
      typeof body.teamId === 'string' ? body.teamId : undefined
    );
    this.save(room);
    return projectRoom(room, identity, this.online());
  }
  async password(identity: Identity, minutes: number) {
    let room = this.read();
    requireRule(memberOf(room, identity).admin, 'admin_only', 403);
    requireRule(
      Number.isInteger(minutes) && minutes >= 1 && minutes <= 480,
      'invalid_input'
    );
    const password = randomToken().slice(0, 24);
    const digest = await hash(password);
    room = this.read();
    requireRule(memberOf(room, identity).admin, 'admin_only', 403);
    room.guestVersion++;
    room.passwordHash = digest;
    room.passwordExpires = room.endsAt
      ? Math.min(Date.now() + minutes * 60_000, room.endsAt)
      : Date.now() + minutes * 60_000;
    room.members = room.members.filter((m) => m.guestVersion === undefined);
    this.record(room, 'password', identity, true);
    this.save(room);
    return { password, expires: room.passwordExpires };
  }
  async ai(identity: Identity, body: Record<string, unknown>) {
    let room = this.read();
    const member = memberOf(room, identity);
    editable(room);
    requireRule(
      body.action === 'compile' ||
        body.action === 'analyze' ||
        body.action === 'run' ||
        body.action === 'scenario',
      'unknown_action'
    );
    if (body.action === 'scenario')
      requireRule(member.admin, 'admin_only', 403);
    const requestedTeamId =
      typeof body.teamId === 'string' ? body.teamId : member.teamId;
    requireRule(
      body.action === 'scenario' ||
        member.admin ||
        memberTeamIds(member).includes(requestedTeamId),
      'invalid_team',
      403
    );
    const team = room.teams.find((t) => t.id === requestedTeamId);
    requireRule(team, 'invalid_team');
    requireRule(
      body.action === 'scenario' || team.prompt.length >= 10,
      'prompt_required'
    );
    requireRule(body.action !== 'run' || team.skills.length, 'skills_required');
    requireRule(room.aiCalls < room.limits.aiCallLimit, 'ai_budget', 429);
    if (body.action !== 'scenario')
      requireRule(
        team.aiCalls < team.limits.aiCallLimit,
        'team_ai_budget',
        429
      );
    const now = Date.now();
    const busy = this.ctx.storage.sql
      .exec<{ expires: number }>(
        'SELECT expires FROM limits WHERE key = ?',
        'ai-job'
      )
      .toArray()[0];
    requireRule(!busy || busy.expires <= now, 'ai_busy', 409);
    const job =
      now +
      (body.action === 'run'
        ? Math.min(room.limits.agentTurnLimit, team.limits.agentTurnLimit) + 2
        : 3) *
        120_000;
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO limits(key,count,expires) VALUES(?,1,?)',
      'ai-job',
      job
    );
    room.aiCalls++;
    if (body.action !== 'scenario') team.aiCalls++;
    this.save(room);
    const snapshot = room;
    const generatedImageIds: string[] = [];
    let committed = false;
    const aiEnv: Env = {
      ...this.env,
      storeGeneratedImage: async (image) => {
        const current = this.read();
        editable(current);
        const actor = memberOf(current, identity);
        requireRule(
          actor.admin || memberTeamIds(actor).includes(team.id),
          'invalid_team',
          403
        );
        requireRule(
          current.teams.some((entry) => entry.id === team.id),
          'invalid_team'
        );
        const id = this.images.store(team.id, image);
        generatedImageIds.push(id);
        return `/api/rooms/${current.id}/images/${id}`;
      },
      authorizeSponsorship: (payload) => {
        const current = this.read();
        editable(current);
        const actor = memberOf(current, identity);
        if (JSON.parse(payload).sponsorship?.phase === 'image_generation')
          this.images.canStore();
        requireRule(
          actor.admin ||
            (body.action !== 'scenario' &&
              memberTeamIds(actor).includes(team.id)),
          'staff_only',
          403
        );
        return this.grants.issue(payload);
      },
      sponsorship: {
        workshopId: room.id,
        workshopTitle: room.title,
        hostId: room.ownerId,
        teamId: team.id,
        teamName: team.name,
        participantId: identity.id,
        operation: body.action as 'compile' | 'analyze' | 'run' | 'scenario',
        scenarioId: room.scenario.id,
        jobId: crypto.randomUUID(),
        sequence: 0,
        receipts: [],
      },
    };
    try {
      const review =
        body.action === 'analyze'
          ? await reviewPrompt(
              aiEnv,
              team.prompt,
              team.revision,
              body.framework === 'craft' ? 'craft' : 'rise',
              body.locale === 'vi' ? 'vi' : 'en'
            )
          : undefined;
      const skills =
        body.action === 'compile'
          ? await compileSkills(aiEnv, team.prompt, body.multiple === true)
          : undefined;
      const scenario =
        body.action === 'scenario'
          ? await makeScenario(
              aiEnv,
              text(body.steering, 2000, 0),
              body.random === true
            )
          : undefined;
      const result =
        body.action === 'run'
          ? await runAgent(aiEnv, team, room.scenario, {
              agentTurnLimit: Math.min(
                room.limits.agentTurnLimit,
                team.limits.agentTurnLimit
              ),
              toolCallLimit: Math.min(
                room.limits.toolCallLimit,
                team.limits.toolCallLimit
              ),
            })
          : undefined;
      room = this.read();
      const actor = memberOf(room, identity);
      requireRule(
        body.action === 'scenario' ||
          actor.admin ||
          memberTeamIds(actor).includes(requestedTeamId),
        'room_changed',
        409
      );
      if (body.action === 'scenario')
        requireRule(actor.admin, 'admin_only', 403);
      editable(room);
      const current = room.teams.find((t) => t.id === requestedTeamId);
      requireRule(current, 'invalid_team');
      requireRule(
        Date.now() < job &&
          (body.action === 'scenario' || current.revision === team.revision) &&
          (body.action === 'compile' ||
            JSON.stringify(room.scenario) ===
              JSON.stringify(snapshot.scenario)) &&
          (body.action !== 'run' ||
            JSON.stringify(current.records) === JSON.stringify(team.records)),
        'room_changed',
        409
      );
      if (skills) current.skills = skills;
      if (review) current.promptReview = review;
      if (scenario) {
        room.scenario = scenario;
        room.scenarios = [...room.scenarios, scenario].slice(-12);
      }
      if (result) {
        current.records = result.records;
        current.runs = [...current.runs, result.run].slice(-10);
      }
      this.record(
        room,
        String(body.action),
        identity,
        body.action === 'scenario',
        body.action === 'scenario' ? undefined : requestedTeamId
      );
      this.save(room);
      committed = true;
    } finally {
      try {
        try {
          if (!committed) this.images.remove(generatedImageIds);
        } catch {
          // Cleanup must never prevent accounting for already-billed usage.
          console.warn('colab_image_cleanup_failed', {
            jobId: aiEnv.sponsorship?.jobId,
          });
        }
        if (aiEnv.sponsorship?.receipts.length) {
          const latest = this.read();
          const previous = latest.sponsorship ?? {
            credits: 0,
            calls: 0,
            receipts: [],
          };
          const receipts = aiEnv.sponsorship.receipts.map((receipt) => ({
            ...receipt,
            operation: String(body.action),
            teamId: team.id,
            at: Date.now(),
          }));
          latest.sponsorship = {
            credits:
              previous.credits +
              receipts.reduce((sum, receipt) => sum + receipt.credits, 0),
            calls: previous.calls + receipts.length,
            receipts: [...previous.receipts, ...receipts].slice(-100),
          };
          this.save(latest);
        }
      } finally {
        this.ctx.storage.sql.exec(
          'DELETE FROM limits WHERE key = ? AND expires = ?',
          'ai-job',
          job
        );
      }
    }
    return projectRoom(this.read(), identity, this.online());
  }
  image(identity: Identity, id: string) {
    const view = projectRoom(this.read(), identity);
    return this.images.read(
      id,
      view.teams.map((team) => team.id)
    );
  }
  async consumeSponsorship(token: string, digest: string) {
    editable(this.read());
    return this.grants.consume(token, digest);
  }
  private online() {
    return [
      ...new Set(
        this.ctx
          .getWebSockets()
          .map((ws) => (ws.deserializeAttachment() as Identity).id)
      ),
    ];
  }
  private broadcast(room: Room) {
    const online = this.online();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(
          JSON.stringify(
            projectRoom(room, ws.deserializeAttachment() as Identity, online)
          )
        );
      } catch {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'access_revoked' }));
          ws.close(1008, 'access_changed');
        }
      }
    }
  }
  async fetch(request: Request) {
    // Only the Worker can reach this binding. Never forward caller headers.
    const identity = JSON.parse(
      request.headers.get('x-colab-identity') ?? 'null'
    ) as Identity | null;
    requireRule(identity, 'sign_in_required', 401);
    const room = this.read();
    memberOf(room, identity);
    requireRule(
      this.ctx
        .getWebSockets()
        .filter(
          (ws) => (ws.deserializeAttachment() as Identity).id === identity.id
        ).length < 4,
      'connection_limit',
      429
    );
    const pair = new WebSocketPair();
    pair[1].serializeAttachment(identity);
    this.ctx.acceptWebSocket(pair[1]);
    this.broadcast(room);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      memberOf(this.read(), ws.deserializeAttachment() as Identity);
      if (message === 'ping') ws.send('pong');
      else ws.close(1008, 'unsupported_message');
    } catch (error) {
      ws.close(
        1008,
        error instanceof RoomError ? error.code : 'access_revoked'
      );
    }
  }
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code === 1005 ? 1000 : code, reason);
    try {
      this.broadcast(this.read());
    } catch {
      /* Room may have no saved state. */
    }
  }
  async alarm() {
    const room = this.read();
    if (room.endsAt === null) return;
    if (room.endsAt > Date.now()) {
      await this.ctx.storage.setAlarm(room.endsAt);
      return;
    }
    if (room.mode === 'open') room.mode = 'readonly';
    this.record(room, 'ended');
    this.save(room);
  }
}
