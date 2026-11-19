import { DurableObject } from 'cloudflare:workers';
import { authorize } from './board/assertion';
import { job } from './board/contracts';
import { Followups } from './board/followups';
import { Leases } from './board/leases';
import { Reads } from './board/reads';
import { schedule } from './board/schedule';
import { errorResponse, reject, Store } from './board/store';
import { boardName, Tasks } from './board/tasks';
import { Writes } from './board/writes';

export class FleetBoard extends DurableObject<Env> {
  readonly #store: Store;
  readonly #reads: Reads;
  readonly #writes: Writes;
  readonly #followups: Followups;
  readonly #name: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#name = ctx.id.name ?? '';
    this.#store = new Store(ctx.storage);
    const tasks = new Tasks(this.#store, env, this.#name);
    const leases = new Leases(this.#store, tasks, env.BOARD_STATE_SECRET);
    this.#followups = new Followups(
      this.#store,
      tasks,
      leases,
      env.BOARD_FOLLOWUPS
    );
    this.#reads = new Reads(
      this.#store,
      tasks,
      this.#followups,
      env.BOARD_STATE_SECRET
    );
    this.#writes = new Writes(this.#store, tasks, leases, this.#followups);
  }

  async fetch(request: Request) {
    try {
      if (
        request.method === 'POST' &&
        request.url === 'https://board.internal/_queue'
      ) {
        const envelope = job.parse(await request.json());
        if (
          boardName(envelope.workspaceId, envelope.boardId) !== this.#name ||
          this.#name !== this.env.BOARD_TASKS_SCOPE
        ) {
          reject(404, 'not_found');
        }
        await this.#followups.consume(envelope);
        await schedule(this.#store);
        return new Response(null, { status: 204 });
      }
      const input = await authorize(request, this.env);
      if (
        boardName(input.actor.workspaceId, input.actor.boardId) !==
          this.#name ||
        this.#name !== this.env.BOARD_TASKS_SCOPE
      )
        reject(404, 'not_found');
      if (input.actor.actor.startsWith('agent:') && !input.actor.agentActive) {
        this.#store.tx(() => {
          const agentKey = input.actor.actor.slice(6);
          const row = this.#store.one(
            'DELETE FROM delegations WHERE agent_key=? AND user_id=? RETURNING expires_at',
            agentKey,
            input.actor.userId
          );
          if (row)
            this.#store.audit(
              input.actor,
              'delegation.deactivated',
              agentKey + ':' + input.actor.userId,
              null,
              { expiresAt: row.expires_at },
              null
            );
        });
        reject(403, 'forbidden');
      }
      const path = input.url.pathname
        .split('/')
        .slice(2)
        .map((part) => decodeURIComponent(part));
      const result =
        request.method === 'GET'
          ? {
              response: await this.#reads.fetch(input.actor, path, input.url),
              status: 200,
            }
          : await this.#writes.fetch(request.method, path, input);
      this.ctx.waitUntil(
        schedule(this.#store).catch(() =>
          console.error('Board alarm scheduling failed')
        )
      );
      return Response.json(result.response, {
        status: result.status,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async alarm() {
    await this.#followups.alarm(this.#name);
  }
}
