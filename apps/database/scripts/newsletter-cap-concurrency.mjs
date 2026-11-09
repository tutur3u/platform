// Proves the newsletter staff-test cap holds under concurrent reservations.
// Needs a Postgres with the newsletter migrations applied and the standard PG*
// environment variables (PGHOST, PGPORT, PGUSER, PGDATABASE). Fixtures are
// inserted with session_replication_role = replica and removed afterwards.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WS = 'c0000000-0000-4000-8000-0000000000e1';
const DOMAIN = 'c0000000-0000-4000-8000-0000000000e2';
const ACTOR = 'c0000000-0000-4000-8000-0000000000e3';
const CAP = 10;
const psqlArgs = ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];

function sql(input) {
  return execFileSync('psql', psqlArgs, { input, encoding: 'utf8' }).trim();
}

const reserveSql = `select private.newsletter_reserve_staff_delivery('${WS}','${ACTOR}','owner@cap-race.example','hello','owner@cap-race.example',true)`;

async function reserveOnce() {
  try {
    const { stdout } = await run('psql', [...psqlArgs, '-c', reserveSql]);
    return { ok: true, id: JSON.parse(stdout.trim()).id };
  } catch (error) {
    return { ok: false, message: String(error.stderr ?? error.message) };
  }
}

const race = (count) =>
  Promise.all(Array.from({ length: count }, () => reserveOnce()));

function cleanup() {
  sql(`set session_replication_role = replica;
    delete from private.newsletter_deliveries where ws_id = '${WS}';
    delete from private.newsletter_sender_addresses where ws_id = '${WS}';
    delete from private.newsletter_sending_domains where ws_id = '${WS}';`);
}

cleanup();
sql(`set session_replication_role = replica;
  insert into private.newsletter_sending_domains (id, ws_id, subdomain, approval,
    dkim_verified, mail_from_verified, txt_verified, ownership_token_hash,
    dns_records, mail_from_domain)
  values ('${DOMAIN}', '${WS}', 'news.cap-race.example', 'approved', true, true, true,
    repeat('b', 64), '[{"type":"CNAME","name":"k","value":"v"}]', 'bounce.news.cap-race.example');
  insert into private.newsletter_sender_addresses (ws_id, domain_id, local_part, approval)
  values ('${WS}', '${DOMAIN}', 'hello', 'approved');`);

try {
  const first = await race(CAP + 15);
  const won = first.filter((item) => item.ok);
  assert.equal(won.length, CAP, 'exactly the cap wins a 25-way race');
  assert.ok(
    first
      .filter((item) => !item.ok)
      .every((item) => item.message.includes('newsletter_daily_cap')),
    'every loser is refused with newsletter_daily_cap'
  );
  assert.equal(
    sql(
      `select count(*) from private.newsletter_deliveries where ws_id='${WS}'`
    ),
    String(CAP)
  );

  // Definite rejections release slots; concurrent reservers refill exactly them.
  for (const item of won.slice(0, 4)) {
    sql(
      `select private.newsletter_finish_staff_delivery('${WS}','${item.id}','rejected')`
    );
  }
  const second = await race(10);
  assert.equal(
    second.filter((item) => item.ok).length,
    4,
    'refill equals released slots'
  );

  // Accepted deliveries keep their slot.
  for (const item of won.slice(4, 7)) {
    sql(
      `select private.newsletter_finish_staff_delivery('${WS}','${item.id}','accepted')`
    );
  }
  const third = await race(5);
  assert.equal(
    third.filter((item) => item.ok).length,
    0,
    'full cap admits nobody'
  );
  assert.equal(
    sql(
      `select count(*) from private.newsletter_deliveries where ws_id='${WS}' and status in ('reserved','accepted')`
    ),
    String(CAP)
  );
  console.log(
    JSON.stringify({
      cap: CAP,
      firstRaceWinners: won.length,
      refilled: 4,
      fullAdmitted: 0,
    })
  );
} finally {
  cleanup();
}
