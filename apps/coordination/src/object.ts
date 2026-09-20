import { DurableObject } from 'cloudflare:workers';
import type {
  CoordinationRequest,
  CoordinationResult,
} from '../../../packages/utils/src/coordination-protocol';

// One persisted row per hashed entity. No email, credentials, or event payloads.
type Row = {
  owner: string;
  lease_until: number;
  fingerprint: string | null;
  completed: number;
  expires_at: number;
};
export class CoordinationObject extends DurableObject<CoordinationEnv> {
  constructor(ctx: DurableObjectState, env: CoordinationEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS coordination (
      id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT NOT NULL,
      lease_until INTEGER NOT NULL, fingerprint TEXT, completed INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
  }

  async execute(input: CoordinationRequest): Promise<CoordinationResult> {
    const now = Date.now();
    // Related SQL reads and writes occur synchronously, before any await.
    const result = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'DELETE FROM coordination WHERE expires_at <= ?',
        now
      );
      const row = this.ctx.storage.sql
        .exec<Row>('SELECT * FROM coordination WHERE id = 1')
        .toArray()[0];
      if (input.action === 'acquire') {
        const fingerprint =
          input.namespace === 'meeting' ? input.fingerprint : null;
        if (row && row.fingerprint !== fingerprint)
          return { outcome: 'conflict' } as const;
        if (row && row.lease_until > now) return { outcome: 'busy' } as const;
        const leaseUntil =
          now + (input.namespace === 'meeting' ? 600_000 : 300_000);
        const expiresAt =
          input.namespace === 'meeting'
            ? (row?.expires_at ?? now + 7_200_000)
            : leaseUntil;
        this.ctx.storage.sql.exec(
          `INSERT INTO coordination VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, lease_until = excluded.lease_until, expires_at = excluded.expires_at`,
          input.owner,
          leaseUntil,
          fingerprint,
          row?.completed ?? 0,
          expiresAt
        );
        return {
          outcome: 'acquired',
          fresh: !row,
          completed: row?.completed === 1,
        } as const;
      }
      if (!row || row.owner !== input.owner || row.lease_until <= now)
        return { outcome: 'lost' } as const;
      if (input.action === 'check') return { outcome: 'owned' } as const;
      if (input.action === 'complete') {
        this.ctx.storage.sql.exec(
          'UPDATE coordination SET completed = 1 WHERE id = 1'
        );
        return { outcome: 'completed' } as const;
      }
      // Meeting fingerprints survive lease release, including failed sends.
      if (input.namespace === 'meeting')
        this.ctx.storage.sql.exec(
          'UPDATE coordination SET lease_until = 0 WHERE id = 1'
        );
      else this.ctx.storage.sql.exec('DELETE FROM coordination WHERE id = 1');
      return { outcome: 'released' } as const;
    });
    await this.scheduleCleanup();
    return result;
  }

  private async scheduleCleanup() {
    const row = this.ctx.storage.sql
      .exec<{ expires_at: number }>(
        'SELECT expires_at FROM coordination WHERE id = 1'
      )
      .toArray()[0];
    if (row) await this.ctx.storage.setAlarm(row.expires_at);
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    this.ctx.storage.sql.exec(
      'DELETE FROM coordination WHERE expires_at <= ?',
      Date.now()
    );
    await this.scheduleCleanup();
  }
}
