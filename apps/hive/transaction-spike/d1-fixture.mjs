export async function initializeD1(db) {
  for (const sql of [
    'CREATE TABLE wallets (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance >= 0))',
    'CREATE TABLE operations (id TEXT PRIMARY KEY, signature TEXT NOT NULL, recipient TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0))',
    'CREATE TABLE ledger (id TEXT PRIMARY KEY, amount INTEGER NOT NULL)',
    `CREATE TRIGGER reject_changed_operation BEFORE INSERT ON operations
      WHEN EXISTS(SELECT 1 FROM operations WHERE id=NEW.id AND signature != NEW.signature)
      BEGIN SELECT RAISE(ABORT,'operation-conflict'); END`,
    `CREATE TRIGGER settle_operation AFTER INSERT ON operations BEGIN
      UPDATE wallets SET balance=balance-NEW.amount WHERE id='seller' AND balance>=NEW.amount;
      SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'insufficient-funds') END;
      UPDATE wallets SET balance=balance+NEW.amount WHERE id=NEW.recipient;
      SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'missing-wallet') END;
      INSERT INTO ledger VALUES(NEW.id,NEW.amount);
    END`,
  ])
    await db.prepare(sql).run();
}

export async function resetD1(db) {
  await db.batch([
    db.prepare('DELETE FROM ledger'),
    db.prepare('DELETE FROM operations'),
    db.prepare('DELETE FROM wallets'),
    db.prepare(
      "INSERT INTO wallets VALUES ('seller',1000),('buyer-a',0),('buyer-b',0)"
    ),
  ]);
}

export async function snapshotD1(db) {
  const rows = await db.batch([
    db.prepare('SELECT id,balance FROM wallets ORDER BY id'),
    db.prepare('SELECT id,amount FROM ledger ORDER BY id'),
    db.prepare('SELECT id,signature FROM operations ORDER BY id'),
  ]);
  return {
    wallets: rows[0].results,
    ledger: rows[1].results,
    operations: rows[2].results,
  };
}

export async function transferD1(db, input) {
  const signature = JSON.stringify([input.to, input.amount]);
  await db.batch([
    db
      .prepare(
        'INSERT INTO operations VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
      )
      .bind(input.id, signature, input.to, input.amount),
    db.prepare('SELECT id FROM ledger WHERE id=?').bind(input.id),
  ]);
}

export async function demonstrateUnsafeReadDecideWrite(db) {
  const reads = await Promise.all([
    db.prepare("SELECT balance FROM wallets WHERE id='seller'").first(),
    db.prepare("SELECT balance FROM wallets WHERE id='seller'").first(),
  ]);
  await Promise.all(
    reads.map((wallet, index) =>
      db.batch([
        db
          .prepare("UPDATE wallets SET balance=? WHERE id='seller'")
          .bind(wallet.balance - 700),
        db
          .prepare('UPDATE wallets SET balance=balance+700 WHERE id=?')
          .bind(index === 0 ? 'buyer-a' : 'buyer-b'),
        db.prepare('INSERT INTO ledger VALUES (?,700)').bind(`unsafe-${index}`),
      ])
    )
  );
  return snapshotD1(db);
}
