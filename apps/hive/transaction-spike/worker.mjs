import { DurableObject } from 'cloudflare:workers';

export class HiveTransactionSpike extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance >= 0));
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, signature TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, amount INTEGER NOT NULL);
    `);
  }

  reset() {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'DELETE FROM ledger; DELETE FROM operations; DELETE FROM wallets;'
      );
      this.sql.exec(
        "INSERT INTO wallets VALUES ('seller',1000),('buyer-a',0),('buyer-b',0)"
      );
    });
  }

  transfer(input) {
    return this.ctx.storage.transactionSync(() => {
      const signature = JSON.stringify([input.to, input.amount]);
      const saved = this.sql
        .exec('SELECT signature FROM operations WHERE id = ?', input.id)
        .toArray()[0];
      if (saved) {
        if (saved.signature !== signature)
          throw new Error('operation-conflict');
        return { id: input.id, replayed: true };
      }
      const wallet = this.sql
        .exec("SELECT balance FROM wallets WHERE id = 'seller'")
        .one();
      if (wallet.balance < input.amount) throw new Error('insufficient-funds');
      this.sql.exec(
        "UPDATE wallets SET balance = balance - ? WHERE id = 'seller'",
        input.amount
      );
      const credited = this.sql
        .exec(
          'UPDATE wallets SET balance = balance + ? WHERE id = ? RETURNING id',
          input.amount,
          input.to
        )
        .toArray();
      if (credited.length !== 1) throw new Error('missing-wallet');
      this.sql.exec('INSERT INTO ledger VALUES (?, ?)', input.id, input.amount);
      this.sql.exec(
        'INSERT INTO operations VALUES (?, ?)',
        input.id,
        signature
      );
      return { id: input.id, replayed: false };
    });
  }

  snapshot() {
    return {
      wallets: this.sql
        .exec('SELECT id,balance FROM wallets ORDER BY id')
        .toArray(),
      ledger: this.sql
        .exec('SELECT id,amount FROM ledger ORDER BY id')
        .toArray(),
      operations: this.sql
        .exec('SELECT id,signature FROM operations ORDER BY id')
        .toArray(),
    };
  }
}

export default {
  async fetch(request, env) {
    if (
      new URL(request.url).hostname !== 'hive-spike.invalid' ||
      request.method !== 'POST'
    ) {
      return new Response('Local fixture only', { status: 403 });
    }
    const input = await request.json();
    if (input.action === 'egress-check') {
      const blocked = await fetch('https://forbidden.invalid/');
      return Response.json({ blocked: blocked.status });
    }
    const stub = env.LEDGER.getByName('disposable-economy');
    try {
      if (input.action === 'reset') {
        await stub.reset();
        return Response.json({ reset: true });
      }
      if (input.action === 'snapshot')
        return Response.json(await stub.snapshot());
      if (
        input.action !== 'transfer' ||
        typeof input.id !== 'string' ||
        input.id.length < 1 ||
        input.id.length > 128 ||
        typeof input.to !== 'string' ||
        input.to.length > 128 ||
        !Number.isSafeInteger(input.amount) ||
        input.amount <= 0 ||
        input.amount > 1000
      ) {
        return new Response('Invalid fixture command', { status: 400 });
      }
      return Response.json(await stub.transfer(input));
    } catch (error) {
      return Response.json({ error: error.message }, { status: 409 });
    }
  },
};
