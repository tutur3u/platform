import { requireRule } from '@tuturuuu/multiplayer';
import { hash, randomToken } from './auth';

/** Persisted, single-use capabilities. Only the room's authorized AI job issues them. */
export class SponsorshipGrants {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS sponsorship_grants (token TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL)'
    );
  }
  async issue(body: string) {
    const token = randomToken();
    const digest = await hash(body);
    this.storage.sql.exec(
      'DELETE FROM sponsorship_grants WHERE expires <= ?',
      Date.now()
    );
    this.storage.sql.exec(
      'INSERT INTO sponsorship_grants VALUES (?, ?, ?)',
      await hash(token),
      digest,
      Date.now() + 60_000
    );
    return token;
  }
  async consume(token: string, digest: string) {
    const key = await hash(token);
    const rows = this.storage.sql
      .exec<{ digest: string }>(
        'DELETE FROM sponsorship_grants WHERE token = ? AND digest = ? AND expires > ? RETURNING digest',
        key,
        digest,
        Date.now()
      )
      .toArray();
    requireRule(rows.length === 1, 'staff_only', 403);
    return { approved: true, digest: rows[0]!.digest };
  }
}
