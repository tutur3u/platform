import { z } from 'zod';
import { readBounded } from '../protocol';
import { ms, uuid, type Identity } from './contracts';
import { type Actor, BoardError, reject, type Store } from './store';

export const boardName = (workspaceId: string, boardId: string) =>
  `board:${workspaceId}:${boardId}`;
const page = z.object({
  asOf: ms,
  candidates: z
    .array(
      z.object({
        taskId: uuid,
        projectId: uuid,
        done: z.boolean(),
        eligible: z.boolean(),
        blockedBy: z
          .array(z.object({ taskId: uuid, done: z.boolean() }))
          .max(256),
      })
    )
    .max(50),
  nextCursor: z.string().min(1).max(1024).nullable(),
});
const access = z.object({
  allowed: z.boolean(),
  done: z.boolean(),
  labelIds: z.array(uuid).max(100),
});
const project = z.object({ allowed: z.boolean() });
const threads = z.object({
  items: z
    .array(
      z.object({ taskId: uuid, title: z.string().max(500), updatedAt: ms })
    )
    .max(100),
  nextCursor: z.string().max(1024).nullable(),
});
export type Candidate = z.infer<typeof page>['candidates'][number];

export class Tasks {
  constructor(
    readonly store: Store,
    readonly env: Env,
    readonly name: string
  ) {}

  private async read<T>(
    actor: Actor,
    generation: number,
    path: string,
    shape: z.ZodType<T>,
    options?: { checkEligibility?: boolean; candidate?: boolean }
  ) {
    const [, workspace, board] = this.name.split(':');
    if (
      !uuid.safeParse(workspace).success ||
      !uuid.safeParse(board).success ||
      this.name !== this.env.BOARD_TASKS_SCOPE ||
      !this.env.BOARD_TASKS_TOKEN
    )
      reject(503, 'tasks_unavailable');
    let url: URL;
    try {
      url = new URL(
        `/api/v1/workspaces/${workspace}/boards/${board}/fleet/${path}`,
        this.env.BOARD_TASKS_ORIGIN
      );
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error();
    } catch {
      reject(503, 'tasks_unavailable');
    }
    this.store.tx(() => {
      const now = Date.now();
      if (options?.checkEligibility) {
        if (!this.store.delegated(actor, now)) reject(403, 'forbidden');
      } else this.store.admit(actor, now);
    });
    this.store.reserve('tasks_reads', generation);
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${this.env.BOARD_TASKS_TOKEN}`,
          'X-Board-User': actor.userId,
          'X-Board-Actor': actor.actor,
        },
      });
      if (response.status === 404 && options?.candidate)
        reject(404, 'not_found');
      if (response.status === 429) reject(429, 'budget_exhausted');
      if (!response.ok) throw new Error();
      return shape.parse(
        JSON.parse(
          new TextDecoder().decode(await readBounded(response.body, 256 * 1024))
        )
      );
    } catch (error) {
      if (error instanceof BoardError) throw error;
      reject(503, 'tasks_unavailable');
    }
  }

  candidates(
    actor: Identity,
    generation: number,
    projectId: string,
    cursor?: string
  ) {
    const query = new URLSearchParams({ projectId, limit: '50' });
    if (cursor) query.set('cursor', cursor);
    return this.read(actor, generation, `candidates?${query}`, page);
  }

  async access(
    actor: Actor,
    generation: number,
    projectId: string,
    taskId: string,
    options?: { candidate: true }
  ) {
    const result = await this.read(
      actor,
      generation,
      `tasks/${taskId}?projectId=${projectId}`,
      access,
      options
    );
    if (!result.allowed) reject(404, 'not_found');
    return result;
  }

  async project(actor: Actor, generation: number, projectId: string) {
    const result = await this.read(
      actor,
      generation,
      `projects/${projectId}`,
      project
    );
    if (!result.allowed) reject(404, 'not_found');
  }

  async principal(
    actor: Identity,
    generation: number,
    subject: string,
    executor?: string
  ) {
    const query = new URLSearchParams({ principal: subject });
    if (executor) query.set('executor', executor);
    const result = await this.read(
      actor,
      generation,
      `principals/eligibility?${query}`,
      project
    );
    if (!result.allowed) reject(422, 'invalid_reference');
  }

  async dispatchActor(
    owner: Pick<Actor, 'actor' | 'userId'>,
    generation: number
  ): Promise<Actor> {
    const actor = { ...owner, manager: false, agentActive: false };
    if (!owner.actor.startsWith('agent:')) return actor;
    const query = new URLSearchParams({
      principal: owner.actor,
      executor: owner.userId,
    });
    const state = await this.read(
      actor,
      generation,
      `principals/eligibility?${query}`,
      project,
      { checkEligibility: true }
    );
    return { ...actor, agentActive: state.allowed };
  }

  threads(
    actor: Actor,
    generation: number,
    projectId: string,
    limit: number,
    cursor?: string
  ) {
    const query = new URLSearchParams({ projectId, limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return this.read(actor, generation, `threads?${query}`, threads);
  }
}
