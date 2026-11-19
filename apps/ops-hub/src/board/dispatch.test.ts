import { describe, expect, it } from 'vitest';
import { changeDelegation, changeGrant, changeStop } from './admin';
import { schedule } from './schedule';
import { WatcherEvents } from './watcher-events';
import {
  agent,
  enableAndDelegate,
  followups,
  id,
  manager,
  name,
  now,
  project,
  send,
  setAlarm,
  store,
  task,
  tasks,
  transport,
} from './test-fixture';

const followupId = id(50);
const watchId = id(51);
const envelope = {
  workspaceId: id(1),
  boardId: id(2),
  id: followupId,
  attempt: 1,
  generation: 1,
};
const boundary = now + 3_600_000;
const allowed = () =>
  Response.json({ allowed: true, done: true, labelIds: [] });

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Missing fixture resolver');
  };
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function seed(
  state: 'pending' | 'queued' | 'delivering',
  deadline = now + 120_000,
  owner = agent
) {
  store.run(
    `INSERT INTO followups VALUES(?,?,?,?,?,?,?,'verify_task','{"expected":"done"}',?,?,1,?,?,?,NULL)`,
    followupId,
    task,
    project,
    owner.actor,
    owner.userId,
    now,
    state === 'pending' ? now : null,
    state === 'pending' ? 0 : 1,
    state,
    state === 'pending' ? null : deadline,
    now,
    now
  );
}

function watch() {
  store.run(
    "INSERT INTO watchers VALUES(?,?,?,?,?,16,'desk','fixture',?,NULL)",
    watchId,
    agent.actor,
    agent.userId,
    project,
    id(53),
    now
  );
}

function stopAndResume() {
  store.tx(() => {
    changeStop(
      store,
      manager,
      { stopped: true, expectedGeneration: 1 },
      id(55)
    );
    changeStop(
      store,
      manager,
      { stopped: false, expectedGeneration: 2 },
      id(56)
    );
  });
}

function operations(
  tasksCount: number,
  queueCount: number,
  alarmCount: number
) {
  expect(transport).toHaveBeenCalledTimes(tasksCount);
  expect(send).toHaveBeenCalledTimes(queueCount);
  expect(setAlarm).toHaveBeenCalledTimes(alarmCount);
  expect(store.control().adapter_calls).toBe(0);
}

describe('Board dispatch fences', () => {
  it('cleans stale queued work on an alarm after stop without starting anything', async () => {
    enableAndDelegate();
    seed('queued');
    store.tx(() =>
      changeStop(
        store,
        manager,
        { stopped: true, expectedGeneration: 1 },
        id(60)
      )
    );
    expect(await followups.consume(envelope)).toBe(false);
    await followups.alarm(name);
    expect(followups.get(followupId)).toMatchObject({
      state: 'cancelled',
      terminal_code: 'stopped',
    });
    expect(store.rows('SELECT * FROM watcher_events')).toEqual([]);
    operations(0, 0, 0);
  });

  it('does not start delivery after stop during the agent eligibility lookup', async () => {
    enableAndDelegate();
    seed('queued');
    const read = deferred<Response>();
    transport.mockReturnValueOnce(read.promise);
    const result = followups.consume(envelope);
    operations(1, 0, 0);
    stopAndResume();
    read.resolve(Response.json({ allowed: true }));
    expect(await result).toBe(false);
    expect(followups.get(followupId)?.state).toBe('queued');
    operations(1, 0, 0);
    await followups.alarm(name);
    expect(followups.get(followupId)).toMatchObject({
      state: 'cancelled',
      terminal_code: 'stopped',
    });
    expect(store.rows('SELECT * FROM watcher_events')).toEqual([]);
    operations(1, 0, 1);
  });

  it('audits a stale completion without producing watcher work or requesting an alarm', async () => {
    enableAndDelegate();
    seed('queued');
    watch();
    const read = deferred<Response>();
    const started = deferred<void>();
    transport
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockImplementationOnce(() => {
        started.resolve();
        return read.promise;
      });
    const result = followups.consume(envelope);
    await started.promise;
    expect(followups.get(followupId)?.state).toBe('delivering');
    stopAndResume();
    read.resolve(allowed());
    expect(await result).toBe(false);
    expect(followups.get(followupId)?.state).toBe('succeeded');
    expect(
      store.one('SELECT action FROM audit ORDER BY seq DESC LIMIT 1')
    ).toMatchObject({ action: 'followup.terminal' });
    expect(store.rows('SELECT * FROM watcher_events')).toEqual([]);
    await new WatcherEvents(store, tasks, () => true).drain();
    expect(store.rows('SELECT * FROM deliveries')).toEqual([]);
    operations(2, 0, 0);
  });

  it('defers a Tasks budget rejection to the next window without spending an attempt', async () => {
    enableAndDelegate();
    seed('queued');
    store.run(
      'UPDATE control SET tasks_reads=120,window_start=? WHERE id=1',
      now
    );
    expect(await followups.consume(envelope)).toBe(true);
    expect(followups.get(followupId)).toMatchObject({
      state: 'pending',
      attempts: 0,
      next_at: boundary,
    });
    operations(0, 0, 0);
    await schedule(store);
    expect(setAlarm).toHaveBeenCalledWith(now + 100_000);
    operations(0, 0, 1);
  });

  it('defers a Queue budget rejection and leaves the attempt untouched', async () => {
    enableAndDelegate();
    seed('pending');
    store.run(
      'UPDATE control SET queue_sends=60,window_start=? WHERE id=1',
      now
    );
    await followups.alarm(name);
    expect(followups.get(followupId)).toMatchObject({
      state: 'pending',
      attempts: 0,
    });
    operations(0, 0, 1);
  });

  it('marks an abandoned delivering row delivery_unknown without dispatch', async () => {
    enableAndDelegate();
    seed('delivering', now);
    await followups.alarm(name);
    expect(followups.get(followupId)).toMatchObject({
      state: 'failed',
      terminal_code: 'delivery_unknown',
    });
    operations(0, 0, 1);
  });

  it('auto-stops at the audit threshold before starting the verifying Tasks read', async () => {
    enableAndDelegate();
    seed('queued', undefined, manager);
    store.run(
      'INSERT INTO grants VALUES(?,?,?,?,?,NULL)',
      project,
      manager.actor,
      'operator',
      manager.actor,
      now
    );
    store.run("UPDATE sqlite_sequence SET seq=239999 WHERE name='audit'");
    expect(await followups.consume(envelope)).toBe(false);
    expect(store.control()).toMatchObject({ stopped: 1, generation: 2 });
    expect(
      store.one("SELECT action FROM audit WHERE action='board.auto_stopped'")
    ).toBeDefined();
    await schedule(store);
    operations(0, 0, 0);
  });

  it('cancels queued work and disables watchers when Tasks reports inactive', async () => {
    enableAndDelegate();
    seed('queued');
    watch();
    transport.mockResolvedValueOnce(Response.json({ allowed: false }));
    expect(await followups.consume(envelope)).toBe(true);
    expect(followups.get(followupId)?.state).toBe('cancelled');
    expect(
      store.one('SELECT disabled_at FROM watchers WHERE id=?', watchId)
    ).toMatchObject({ disabled_at: now });
    expect(store.delegated(agent, now)).toBe(false);
    operations(1, 0, 0);
  });

  it.each(['delegation', 'grant'] as const)(
    'cancels pending work on %s revoke',
    async (kind) => {
      enableAndDelegate();
      seed('pending');
      watch();
      store.tx(() => {
        if (kind === 'delegation')
          changeDelegation(
            store,
            manager,
            'iris',
            agent.userId,
            {},
            id(60),
            now,
            true
          );
        else
          changeGrant(
            store,
            manager,
            project,
            agent.actor,
            {},
            id(61),
            now,
            true
          );
      });
      expect(followups.get(followupId)?.state).toBe('cancelled');
      expect(
        store.one('SELECT disabled_at FROM watchers WHERE id=?', watchId)
      ).toMatchObject({
        disabled_at: kind === 'delegation' ? now : null,
      });
      await followups.consume(envelope);
      operations(0, 0, 0);
    }
  );

  it('skips unavailable desk and webhook targets without dispatch', async () => {
    enableAndDelegate();
    seed('delivering', now);
    watch();
    store.run(
      "INSERT INTO watchers SELECT ?,owner_key,owner_user_id,channel_id,label_id,event_mask,'webhook',target_ref,created_at,NULL FROM watchers WHERE id=?",
      id(54),
      watchId
    );
    await followups.alarm(name);
    expect(store.rows('SELECT * FROM deliveries')).toEqual([]);
    operations(0, 0, 1);
  });

  it('retains the event when Tasks label lookup is unavailable', async () => {
    enableAndDelegate();
    seed('delivering', now);
    watch();
    const row = followups.get(followupId);
    if (!row) throw new Error('Missing fixture follow-up');
    store.tx(() => followups.finish(row, 'succeeded', 'verified'));
    transport
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await new WatcherEvents(store, tasks, (kind) => kind === 'desk').drain();
    expect(store.one('SELECT retry_at FROM watcher_events')).toMatchObject({
      retry_at: now + 60_000,
    });
    expect(store.rows('SELECT * FROM deliveries')).toEqual([]);
    operations(2, 0, 0);
  });
});
