import { createRoom, type Room } from '@tuturuuu/multiplayer';
import type { Env } from '../src/server/env';
import { ColabRoom } from '../src/server/room';

// Loopback-only fixture: real SQLite/DO runtime, no provider or production bindings.
export class ExpiryFixture extends ColabRoom {
  constructor(
    private readonly fixtureState: DurableObjectState,
    env: Env
  ) {
    super(fixtureState, env);
  }
  async verify(failure: boolean) {
    const sql = this.fixtureState.storage.sql;
    const now = Date.now();
    const room = createRoom(
      'fixture',
      {
        id: 'fixture-host',
        email: 'host@tuturuuu.com',
        name: 'Host',
        expires: now + 3600_000,
      },
      {
        title: 'Fixture',
        startsAt: null,
        endsAt: now + 300_000,
        teamCount: 1,
        maxUsers: 10,
      },
      now
    );
    room.endsAt = now - 1;
    sql.exec('INSERT OR REPLACE INTO state VALUES(1, ?)', JSON.stringify(room));
    if (failure) {
      sql.exec(
        "CREATE TRIGGER fail_marker BEFORE INSERT ON state WHEN NEW.id = 3 BEGIN SELECT RAISE(ABORT, 'fixture marker failure'); END"
      );
      let threw = false;
      try {
        await this.alarm();
      } catch {
        threw = true;
      }
      const persisted = JSON.parse(
        sql
          .exec<{ value: string }>('SELECT value FROM state WHERE id = 1')
          .one().value
      ) as Room;
      if (
        !threw ||
        persisted.revision !== 0 ||
        persisted.mode !== 'open' ||
        sql.exec('SELECT * FROM state WHERE id IN (2,3)').toArray().length
      )
        throw new Error('Expiry did not roll back atomically');
      sql.exec('DROP TRIGGER fail_marker');
    }
    for (let wake = 0; wake < 100; wake++) await this.alarm();
    const persisted = JSON.parse(
      sql.exec<{ value: string }>('SELECT value FROM state WHERE id = 1').one()
        .value
    ) as Room;
    const audit = JSON.parse(
      sql.exec<{ value: string }>('SELECT value FROM state WHERE id = 2').one()
        .value
    ) as NonNullable<Room['audit']>;
    const marker = JSON.parse(
      sql.exec<{ value: string }>('SELECT value FROM state WHERE id = 3').one()
        .value
    );
    return {
      revision: persisted.revision,
      mode: persisted.mode,
      ended: audit.filter((e) => e.action === 'ended').length,
      complete: marker === room.endsAt,
      nextAlarm: await this.fixtureState.storage.getAlarm(),
    };
  }
}
export default {
  async fetch(
    request: Request,
    env: { FIXTURES: DurableObjectNamespace<ExpiryFixture> }
  ) {
    const failure = new URL(request.url).pathname === '/failure';
    const result = await env.FIXTURES.getByName(crypto.randomUUID()).verify(
      failure
    );
    return Response.json(result);
  },
};
