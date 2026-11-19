import { expect, it, vi } from 'vitest';
import { changeGrant } from './admin';
import { boardPath } from './assertion';
import { Reads } from './reads';
import { watch } from './write-actions';
import {
  agent,
  enableAndDelegate,
  followups,
  id,
  leases,
  manager,
  now,
  project,
  send,
  setAlarm,
  store,
  task,
  tasks,
  transport,
} from './test-fixture';

const path = ['channels', project, 'threads', task, 'messages'];
const url = new URL('https://board.invalid/board/' + path.join('/'));
const allow = () => Response.json({ allowed: true, done: false, labelIds: [] });
const read = () =>
  new Reads(store, tasks, followups, 'fixture-state-key-0000000000000000000');

function giveManagerAccess() {
  store.run(
    'INSERT INTO grants VALUES(?,?,?,?,?,NULL)',
    project,
    manager.actor,
    'operator',
    manager.actor,
    now
  );
}

it('caches positive Tasks access per user and task for at most 60 seconds', async () => {
  enableAndDelegate();
  giveManagerAccess();
  const reads = read();
  transport.mockImplementation(async () => allow());
  await expect(reads.fetch(agent, path, url)).resolves.toEqual({
    items: [],
    nextCursor: null,
  });
  await reads.fetch(agent, path, url);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(
    new Headers(transport.mock.calls[0]?.[1]?.headers).get('X-Board-User')
  ).toBe(agent.userId);
  await reads.fetch(manager, path, url);
  await reads.fetch(
    agent,
    ['channels', project, 'threads', id(30), 'messages'],
    url
  );
  expect(transport).toHaveBeenCalledTimes(3);
  vi.mocked(Date.now).mockReturnValue(now + 60_000);
  await reads.fetch(agent, path, url);
  expect(transport).toHaveBeenCalledTimes(4);
});

it('fails closed on unavailable Tasks and rechecks the channel grant after authorization', async () => {
  enableAndDelegate();
  const reads = read();
  transport.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(reads.fetch(agent, path, url)).rejects.toThrow(
    'tasks_unavailable'
  );
  transport.mockResolvedValueOnce(
    Response.json({ allowed: false, done: false, labelIds: [] })
  );
  await expect(reads.fetch(agent, path, url)).rejects.toThrow('not_found');
  transport.mockImplementationOnce(async () => {
    store.tx(() =>
      changeGrant(store, manager, project, agent.actor, {}, id(31), now, true)
    );
    return allow();
  });
  await expect(reads.fetch(agent, path, url)).rejects.toThrow('not_found');
  expect(transport).toHaveBeenCalledTimes(3);
});

it('returns 404 for hidden explain requests before checking manager authority', async () => {
  enableAndDelegate();
  const outsider = { ...manager, manager: false };
  const target = new URL(
    `https://board.invalid/board/channels/${project}/explain`
  );
  target.searchParams.set('principal', agent.actor);
  await expect(
    read().fetch(outsider, ['channels', project, 'explain'], target)
  ).rejects.toMatchObject({ status: 404 });
});

it('skips a candidate whose Tasks access lookup denies visibility', async () => {
  enableAndDelegate();
  const other = id(35);
  transport
    .mockResolvedValueOnce(
      Response.json({
        asOf: now,
        nextCursor: null,
        candidates: [task, other].map((taskId) => ({
          taskId,
          projectId: project,
          done: false,
          eligible: true,
          blockedBy: [],
        })),
      })
    )
    .mockResolvedValueOnce(
      Response.json({ allowed: false, done: false, labelIds: [] })
    )
    .mockResolvedValueOnce(allow());
  await expect(
    leases.prepareClaim(agent, project, 1, id(36))
  ).resolves.toMatchObject({ taskId: other });
  expect(transport).toHaveBeenCalledTimes(3);
});

it('counts only enabled watchers and enforces the per-owner limit', () => {
  enableAndDelegate();
  store.run(
    `WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<256)
    INSERT INTO watchers SELECT 'disabled-'||i,?,?,?,NULL,1,'desk','fixture',?,? FROM seq`,
    agent.actor,
    agent.userId,
    project,
    now,
    now
  );
  const create = () =>
    store.tx(() =>
      watch(
        store,
        {
          actor: agent,
          json: {
            channelId: project,
            eventMask: 1,
            target: { kind: 'desk', ref: 'fixture' },
          },
          idempotency: id(57),
          fingerprint: 'fixture',
          url,
        },
        now
      )
    );
  expect(create()).toBeDefined();
  store.run(
    `WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<15)
    INSERT INTO watchers SELECT 'enabled-'||i,?,?,?,NULL,1,'desk','fixture',?,NULL FROM seq`,
    agent.actor,
    agent.userId,
    project,
    now
  );
  expect(create).toThrow('budget_exhausted');
});

it('isolates replay and mutation pressure per actor with no outbound work', () => {
  enableAndDelegate();
  store.run(
    `WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<200)
    INSERT INTO idempotency SELECT ?,?,'replay-'||i,'fixture',200,'{}',?,? FROM seq`,
    agent.userId,
    agent.actor,
    now,
    now + 60_000
  );
  expect(() => store.replayCapacity(agent, false, now)).toThrow(
    'budget_exhausted'
  );
  expect(() => store.replayCapacity(manager, false, now)).not.toThrow();
  for (const [operation, cap] of [
    ['renew', 30],
    ['watcher', 15],
    ['cancel', 30],
  ] as const) {
    for (let n = 0; n < cap; n++) store.charge(agent, operation, now);
    expect(() => store.charge(agent, operation, now)).toThrow(
      'budget_exhausted'
    );
    expect(() => store.charge(manager, operation, now)).not.toThrow();
  }
  expect(transport).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(setAlarm).not.toHaveBeenCalled();
  expect(store.control().adapter_calls).toBe(0);
});

it('returns 400 for malformed URI escapes', () => {
  expect(() => boardPath('/board/channels/%ff')).toThrow('invalid_request');
  expect(boardPath('/board/channels/a%20b')).toEqual(['channels', 'a b']);
});
