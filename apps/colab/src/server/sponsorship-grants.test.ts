import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { hash } from './auth';
import { SponsorshipGrants } from './sponsorship-grants';

const databases: DatabaseSync[] = [];
function fixture() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  const storage = {
    sql: {
      exec: (query: string, ...args: (string | number)[]) => ({
        toArray: () => db.prepare(query).all(...args),
      }),
    },
  } as unknown as DurableObjectStorage;
  // The real API executes eagerly, including DDL and INSERT without toArray().
  storage.sql.exec = ((query: string, ...args: (string | number)[]) => {
    const rows = db.prepare(query).all(...args);
    return { toArray: () => rows };
  }) as typeof storage.sql.exec;
  return { grants: new SponsorshipGrants(storage), db };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});
it('expires approvals after sixty seconds and prunes them on issuance', async () => {
  const { grants, db } = fixture();
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const token = await grants.issue('request');
  vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
  await expect(grants.consume(token, await hash('request'))).rejects.toThrow();
  await grants.issue('next');
  expect(db.prepare('SELECT * FROM sponsorship_grants').all()).toHaveLength(1);
});
it('stores only token and request hashes, and consumes once', async () => {
  const { grants, db } = fixture();
  const token = await grants.issue('private prompt');
  const stored = JSON.stringify(
    db.prepare('SELECT * FROM sponsorship_grants').all()
  );
  expect(stored).not.toContain(token);
  expect(stored).not.toContain('private prompt');
  await expect(grants.consume(token, await hash('tampered'))).rejects.toThrow();
  await expect(
    grants.consume(token, await hash('private prompt'))
  ).resolves.toMatchObject({ approved: true });
  await expect(
    grants.consume(token, await hash('private prompt'))
  ).rejects.toThrow();
});
