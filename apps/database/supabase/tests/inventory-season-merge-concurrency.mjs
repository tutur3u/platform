// Actual independent PostgreSQL clients; only an owned official disposable stack.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { assertDisposableRoot } from '../../scripts/run-supabase-isolated.js';

const root = assertDisposableRoot(process.argv[2] ?? '');
const metadata = JSON.parse(
  readFileSync(path.join(root, '.tuturuuu-isolated-supabase.json'), 'utf8')
);
assert.equal(realpathSync(metadata.disposableRoot), realpathSync(root));
assert.equal(
  realpathSync(metadata.repositoryRoot),
  realpathSync(process.cwd())
);
assert(
  execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .includes(`supabase_db_${metadata.projectId}`)
);
const require = createRequire(
  new URL('../../../../packages/inventory-core/package.json', import.meta.url)
);
const postgres = require('postgres');
const clients = Array.from({ length: 4 }, (_, n) =>
  postgres({
    host: '127.0.0.1',
    port: metadata.basePort + 2,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres',
    max: 1,
    connection: { application_name: `ismc_${n}` },
  })
);
const [control, mergingClient, assignmentWriter, priceWriter] = clients;
const id = (n) => `00009200-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const ok = (name) => console.log(`ok ${++checks} - ${name}`);
const wait = async (query) => {
  const deadline = Date.now() + 5000;
  while (!(await query()).length) {
    assert(Date.now() < deadline, 'Missing independent concurrency barrier');
    await new Promise((r) => setTimeout(r, 10));
  }
};
console.log('1..11');
try {
  const fixture = readFileSync(
    new URL('./inventory-season-merge.sql', import.meta.url),
    'utf8'
  )
    .split('-- A real recoverable historical invoice')[0]
    .replace('begin;', '')
    .replace('select no_plan();', '');
  await control.unsafe(fixture);
  await control.unsafe(
    `create function private.ismc_pause() returns trigger language plpgsql as $$begin perform pg_sleep(2); return new; end;$$; create trigger ismc_pause after insert on private.inventory_season_merges for each row execute function private.ismc_pause();`
  );
  await control.unsafe("set lock_timeout='500ms'");
  const [{ preview }] =
    await control`select private.preview_inventory_season_merge(${id(10)},${id(30)},${id(31)},${id(1)}) preview`;
  const merging =
    mergingClient`select private.apply_inventory_season_merge(${id(10)},${id(30)},${id(31)},${preview.version},'target','target','target',${id(1)}) result`.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
  await wait(
    () =>
      control`select 1 from pg_stat_activity where application_name='ismc_1' and wait_event='PgSleep'`
  );
  ok('real merge holds only source/destination parent locks at barrier');
  const assignment =
    assignmentWriter`insert into private.inventory_sales_period_assignments(ws_id,period_id,sale_source,sale_id) values(${id(10)},${id(30)},'finance_invoice',${id(60)})`.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
  const price =
    priceWriter`insert into private.inventory_product_prices(ws_id,period_id,product_id,unit_id,warehouse_id,currency,price,valid_from,valid_to) values(${id(10)},${id(30)},${id(24)},${id(22)},${id(23)},'USD',99,now()+interval '5 days',now()+interval '6 days')`.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
  await wait(
    () =>
      control`select 1 from pg_stat_activity where application_name in ('ismc_2','ismc_3') and wait_event_type='Lock' group by wait_event_type having count(*)=2`
  );
  ok('assignment and price writers independently wait for selected parent');
  const start = Date.now();
  await control`update private.inventory_sales_periods set description='Concurrent unrelated period' where id=${id(34)}`;
  assert(Date.now() - start < 750);
  ok('same workspace other period UPDATE remains unblocked');
  await control`update private.inventory_sales_periods set description='Concurrent other workspace' where id=${id(35)}`;
  ok('other workspace period UPDATE remains unblocked');
  await control`insert into private.inventory_sales_period_assignments(ws_id,period_id,sale_source,sale_id) values(${id(11)},${id(35)},'finance_invoice',${id(61)})`;
  await control`delete from private.inventory_sales_period_assignments where ws_id=${id(11)} and sale_id=${id(61)}`;
  ok('other workspace assignment INSERT and DELETE remain unblocked');
  const merged = await merging;
  assert.ifError(merged.error);
  assert.equal((await assignment).error?.code, '23514');
  ok('same-source assignment rechecks alias and rejects after actual commit');
  assert.equal((await price).error?.code, '23514');
  ok('same-source price rechecks alias and rejects after actual commit');
  assert.equal(
    Number(
      (
        await control`select amount from private.inventory_products where product_id=${id(24)}`
      )[0].amount
    ),
    123
  );
  ok('concurrent season merge leaves stock untouched');
  assert.equal(
    Number(
      (
        await control`select count(*) count from private.inventory_product_prices where period_id=${id(30)}`
      )[0].count
    ),
    2
  );
  ok('all original prices retained with no stale source price');
  const [{ preview: expiring }] =
    await control`select private.preview_inventory_season_merge(${id(10)},${id(33)},${id(34)},${id(1)}) preview`;
  await control`update private.inventory_season_merge_previews set expires_at=clock_timestamp()+interval '1 second' where id=${expiring.version}`;
  const expired =
    await mergingClient`select private.apply_inventory_season_merge(${id(10)},${id(33)},${id(34)},${expiring.version},'target','target','block',${id(1)}) result`.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
  assert.equal(expired.error?.code, '40001');
  ok('server deadline expiring at real receipt barrier rolls back apply');
  assert.equal(
    Number(
      (
        await control`select count(*) count from private.inventory_season_merges where source_id=${id(33)}`
      )[0].count
    ),
    0
  );
  assert.equal(
    (
      await control`select merged_into_id from private.inventory_sales_periods where id=${id(33)}`
    )[0].merged_into_id,
    null
  );
  ok('deadline rollback leaves no receipt, alias or imported planning writes');
  assert.equal(checks, 11);
} finally {
  await control.unsafe(
    'drop trigger if exists ismc_pause on private.inventory_season_merges; drop function if exists private.ismc_pause();'
  );
  await control`delete from public.workspaces where id in (${id(10)},${id(11)})`;
  await control`delete from auth.users where id in (${id(1)},${id(2)})`;
  await control.unsafe('drop function if exists public.ism_id(integer)');
  await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
}
