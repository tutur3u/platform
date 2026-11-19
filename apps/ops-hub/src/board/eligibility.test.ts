import { expect, it } from 'vitest';
import {
  agent,
  enableAndDelegate,
  followups,
  id,
  now,
  project,
  store,
  task,
  transport,
} from './test-fixture';
import { WatcherEvents } from './watcher-events';
import { system } from './store';
import { tasks } from './test-fixture';

const followupId = id(61);
const watcherId = id(62);

function seed() {
  enableAndDelegate();
  store.run(
    `INSERT INTO followups VALUES(?,?,?,?,?,?,NULL,'verify_task','{"expected":"done"}',1,'queued',1,?,?,?,NULL)`,
    followupId,
    task,
    project,
    agent.actor,
    agent.userId,
    now,
    now + 120_000,
    now,
    now
  );
  store.run(
    "INSERT INTO watchers VALUES(?,?,?,?,NULL,16,'desk','fixture',?,NULL)",
    watcherId,
    agent.actor,
    agent.userId,
    project,
    now
  );
}

it.each([
  ['inactive', 'inactive', true],
  ['deactivated', 'deactivated', true],
  ['not_member', 'not_member', false],
  ['rate_limited', 'rate_limited', false],
  ['error', 'error', false],
  ['unknown', 'error', false],
  [undefined, 'error', false],
] as const)(
  'interprets eligibility denial %s conservatively',
  async (reason, auditReason, revoked) => {
    seed();
    transport.mockResolvedValueOnce(Response.json({ allowed: false, reason }));
    await followups.consume({
      workspaceId: id(1),
      boardId: id(2),
      id: followupId,
      generation: 1,
      attempt: 1,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(store.delegated(agent, now)).toBe(!revoked);
    expect(followups.get(followupId)?.state).toBe('cancelled');
    expect(
      store.one('SELECT disabled_at FROM watchers WHERE id=?', watcherId)
    ).toMatchObject({
      disabled_at: revoked ? now : null,
    });
    expect(
      store.one(
        'SELECT action,after_json FROM audit WHERE action IN (?,?)',
        'delegation.deactivated',
        'authorization.dispatch_denied'
      )
    ).toMatchObject(
      revoked
        ? { action: 'delegation.deactivated' }
        : {
            action: 'authorization.dispatch_denied',
            after_json: JSON.stringify({ reason: auditReason }),
          }
    );
  }
);

it('audits a transport failure without revoking or starting verification', async () => {
  seed();
  transport.mockRejectedValueOnce(new TypeError('fixture transport failure'));
  await followups.consume({
    workspaceId: id(1),
    boardId: id(2),
    id: followupId,
    generation: 1,
    attempt: 1,
  });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(store.delegated(agent, now)).toBe(true);
  expect(
    store.one(
      "SELECT after_json FROM audit WHERE action='authorization.dispatch_denied'"
    )
  ).toMatchObject({ after_json: '{"reason":"error"}' });
});

it('skips and audits a watcher denial without disabling the watcher', async () => {
  seed();
  store.tx(() =>
    store.audit(system, 'followup.terminal', followupId, project, null, {
      state: 'failed',
    })
  );
  transport.mockResolvedValueOnce(
    Response.json({ allowed: false, reason: 'not_member' })
  );
  await new WatcherEvents(store, tasks, () => true).drain();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(store.delegated(agent, now)).toBe(true);
  expect(
    store.one('SELECT disabled_at FROM watchers WHERE id=?', watcherId)
  ).toMatchObject({ disabled_at: null });
  expect(store.rows('SELECT * FROM deliveries')).toEqual([]);
  expect(
    store.one(
      "SELECT after_json FROM audit WHERE action='authorization.dispatch_denied'"
    )
  ).toMatchObject({ after_json: '{"reason":"not_member"}' });
});
