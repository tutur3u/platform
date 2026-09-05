import { DurableObject } from 'cloudflare:workers';
import {
  createRoom,
  editable,
  type Identity,
  joinRoom,
  memberOf,
  mutateRoom,
  projectRoom,
  type Room,
  requireRule,
  text,
} from '@tuturuuu/multiplayer';
import { compileSkills, makeScenario, runAgent } from './ai';
import { hash, randomToken } from './auth';
import type { Env } from './env';

export class ColabRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
    return JSON.parse(row.value);
  }
  private save(room: Room) {
    room.revision++;
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO state(id, value) VALUES(1, ?)',
      JSON.stringify(room)
    );
    this.broadcast(room);
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
    await this.ctx.storage.setAlarm(room.endsAt);
    requireRule(
      !this.ctx.storage.sql.exec('SELECT id FROM state WHERE id = 1').toArray()
        .length,
      'room_exists',
      409
    );
    this.save(room);
    return projectRoom(room, identity);
  }
  view(identity: Identity) {
    return projectRoom(this.read(), identity, this.online());
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
    requireRule(
      room.mode === 'open' && Date.now() < room.endsAt,
      'room_not_open',
      403
    );
    const password = randomToken().slice(0, 24);
    const digest = await hash(password);
    room = this.read();
    requireRule(memberOf(room, identity).admin, 'admin_only', 403);
    requireRule(
      room.mode === 'open' && Date.now() < room.endsAt,
      'room_not_open',
      403
    );
    room.guestVersion++;
    room.passwordHash = digest;
    room.passwordExpires = Math.min(Date.now() + minutes * 60_000, room.endsAt);
    room.members = room.members.filter((m) => m.guestVersion === undefined);
    this.save(room);
    return { password, expires: room.passwordExpires };
  }
  async ai(identity: Identity, body: Record<string, unknown>) {
    let room = this.read();
    const member = memberOf(room, identity);
    editable(room);
    requireRule(
      body.action === 'compile' ||
        body.action === 'run' ||
        body.action === 'scenario',
      'unknown_action'
    );
    if (body.action === 'scenario')
      requireRule(member.admin, 'admin_only', 403);
    const team = room.teams.find((t) => t.id === member.teamId);
    requireRule(team, 'invalid_team');
    requireRule(
      body.action === 'scenario' || team.prompt.length >= 10,
      'prompt_required'
    );
    requireRule(body.action !== 'run' || team.skills.length, 'skills_required');
    requireRule(room.aiCalls < 200, 'ai_budget', 429);
    const now = Date.now();
    const busy = this.ctx.storage.sql
      .exec<{ expires: number }>(
        'SELECT expires FROM limits WHERE key = ?',
        'ai-job'
      )
      .toArray()[0];
    requireRule(!busy || busy.expires <= now, 'ai_busy', 409);
    const job = now + 180_000;
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO limits(key,count,expires) VALUES(?,1,?)',
      'ai-job',
      job
    );
    room.aiCalls++;
    this.save(room);
    const revision = room.revision;
    try {
      const skills =
        body.action === 'compile'
          ? await compileSkills(this.env, team.prompt, body.multiple === true)
          : undefined;
      const scenario =
        body.action === 'scenario'
          ? await makeScenario(this.env, text(body.steering, 2000, 0))
          : undefined;
      const result =
        body.action === 'run'
          ? await runAgent(this.env, team, room.scenario)
          : undefined;
      room = this.read();
      memberOf(room, identity);
      editable(room);
      requireRule(
        room.revision === revision && Date.now() < job,
        'room_changed',
        409
      );
      const current = room.teams.find((t) => t.id === member.teamId);
      requireRule(current, 'invalid_team');
      if (skills) current.skills = skills;
      if (scenario) {
        room.scenario = scenario;
        room.scenarios = [...room.scenarios, scenario].slice(-12);
      }
      if (result) {
        current.records = result.records;
        current.runs = [...current.runs, result.run].slice(-10);
      }
      this.save(room);
      return projectRoom(room, identity, this.online());
    } finally {
      this.ctx.storage.sql.exec(
        'DELETE FROM limits WHERE key = ? AND expires = ?',
        'ai-job',
        job
      );
    }
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
    } catch {
      ws.close(1008, 'session_expired');
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
    if (room.endsAt > Date.now()) {
      await this.ctx.storage.setAlarm(room.endsAt);
      return;
    }
    if (room.mode === 'open') room.mode = 'readonly';
    this.save(room);
  }
}
