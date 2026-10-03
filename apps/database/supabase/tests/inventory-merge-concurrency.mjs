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
const clients = Array.from({ length: 3 }, (_, n) =>
  postgres({
    host: '127.0.0.1',
    port: metadata.basePort + 2,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres',
    max: 1,
    connection: { application_name: `imc_${n}` },
  })
);
const [control, merge, writer] = clients;
const id = (n) => `00009020-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const ok = (name) => console.log(`ok ${++checks} - ${name}`);
const deadlineWait = async (query) => {
  const deadline = Date.now() + 5000;
  while (!(await query()).length) {
    assert(Date.now() < deadline, 'Missing concurrency barrier');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const apply = (sql, source = 50) =>
  sql`select private.apply_inventory_merge(${id(10)},'product',${id(source)},${id(51)},private.preview_inventory_merge(${id(10)},'product',${id(source)},${id(51)})->>'version','target','target',${id(1)}) result`;
console.log('1..22');
try {
  await control.unsafe(
    'begin;' +
      "create function public.imc_id(n integer) returns uuid language sql immutable as $$select ('00009020-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;\ninsert into auth.users(id) values(imc_id(1));\ninsert into public.users(id) values(imc_id(1)) on conflict do nothing;\ninsert into public.workspaces(id,name,personal,creator_id) values(imc_id(10),'Synthetic merge',false,imc_id(1)),(imc_id(11),'Other workspace',false,imc_id(1));\ninsert into public.workspace_members(ws_id,user_id,type) values(imc_id(10),imc_id(1),'MEMBER') on conflict do nothing;\ninsert into public.workspace_users(id,ws_id,full_name) values(imc_id(90),imc_id(10),'Synthetic merge actor');\ninsert into private.inventory_owners(id,ws_id,name) values(imc_id(20),imc_id(10),'Owner');\ninsert into private.inventory_units(id,ws_id,name) values(imc_id(21),imc_id(10),'Each'),(imc_id(22),imc_id(10),'Box');\ninsert into private.inventory_warehouses(id,ws_id,name) values(imc_id(30),imc_id(10),'Source warehouse'),(imc_id(31),imc_id(10),'Target warehouse'),(imc_id(32),imc_id(11),'Other');\ninsert into public.product_categories(id,ws_id,name) values(imc_id(40),imc_id(10),'Category');\ninsert into public.workspace_products(id,ws_id,name,owner_id,category_id) values\n (imc_id(50),imc_id(10),'Source product',imc_id(20),imc_id(40)),(imc_id(51),imc_id(10),'Target product',imc_id(20),imc_id(40)),\n (imc_id(52),imc_id(10),'Third product',imc_id(20),imc_id(40));\ninsert into private.inventory_products(product_id,warehouse_id,unit_id,amount,price,min_amount) values\n (imc_id(50),imc_id(30),imc_id(21),3,100,1),(imc_id(51),imc_id(30),imc_id(21),7,200,2),\n (imc_id(50),imc_id(30),imc_id(22),2,500,0);\ninsert into public.product_stock_changes(id,product_id,warehouse_id,unit_id,amount,creator_id) values(imc_id(60),imc_id(50),imc_id(30),imc_id(21),3,imc_id(90));\n\ninsert into private.inventory_owners(id,ws_id,name) values(imc_id(120),imc_id(11),'Other owner');\ninsert into public.product_categories(id,ws_id,name) values(imc_id(140),imc_id(11),'Other category');\ninsert into public.workspace_products(id,ws_id,name,owner_id,category_id) values(imc_id(150),imc_id(11),'Other product',imc_id(120),imc_id(140));\ninsert into private.inventory_units(id,ws_id,name) values(imc_id(121),imc_id(11),'Other unit'),(imc_id(122),imc_id(11),'Other unit two');\ninsert into private.inventory_products(product_id,warehouse_id,unit_id,amount,price) values(imc_id(150),imc_id(32),imc_id(121),10,200);\ncreate function private.imc_pause_merge() returns trigger language plpgsql as $$ begin\n if new.ws_id=public.imc_id(10) then perform pg_sleep(3); end if; return new;\nend; $$;\ncreate trigger imc_pause_merge after insert on private.inventory_identity_merges for each row execute function private.imc_pause_merge();\n\ninsert into public.workspace_products(id,ws_id,name,owner_id,category_id) values(public.imc_id(53),public.imc_id(10),'Row lock source',public.imc_id(20),public.imc_id(40));" +
      'commit;'
  );
  await control`insert into public.workspace_products(id,ws_id,name,owner_id,category_id)
    select public.imc_id(n),${id(11)},'Synthetic bulk product',${id(120)},${id(140)} from generate_series(1000,1999)n`;
  await control`insert into public.workspace_products(id,ws_id,name,owner_id,category_id)
    select public.imc_id(n),${id(10)},'Synthetic bucket fixture',${id(20)},${id(40)} from generate_series(200,499)n`;
  const [distinct] =
    await control`select id from public.workspace_products where ws_id=${id(10)}
    and private.inventory_identity_lock_key('product',id) not in
      (private.inventory_identity_lock_key('product',${id(50)}),private.inventory_identity_lock_key('product',${id(51)}))
    order by id limit 1`;
  const [collision] =
    await control`select id from public.workspace_products where ws_id=${id(10)}
    and id<>${id(50)} and id<>${id(51)}
    and private.inventory_identity_lock_key('product',id)=private.inventory_identity_lock_key('product',${id(50)})
    order by id limit 1`;
  assert(
    distinct && collision,
    'Both bucket cases must have real independent fixture identities'
  );
  const merging = apply(merge).then((result) => result);
  await deadlineWait(
    () =>
      control`select 1 from pg_stat_activity where application_name='imc_1' and wait_event='PgSleep'`
  );
  await control`update private.inventory_products set amount=amount+1 where product_id=${id(150)}`;
  ok('unrelated workspace stock UPDATE during actual merge');
  await control`insert into private.inventory_products(product_id,warehouse_id,unit_id,amount) values(${id(150)},${id(32)},${id(122)},1)`;
  ok('unrelated workspace stock INSERT during actual merge');
  await control`delete from private.inventory_products where product_id=${id(150)} and unit_id=${id(122)}`;
  ok('unrelated workspace stock DELETE during actual merge');
  await control`update public.workspace_products set name='Concurrent other' where id=${id(150)}`;
  ok('unrelated workspace metadata UPDATE during actual merge');
  await control`update public.workspace_products set name='Concurrent third' where id=${distinct.id}`;
  ok('unrelated same-workspace bucket stays writable');
  await assert.rejects(
    control`update public.workspace_products set name='Collision' where id=${collision.id}`,
    (e) => e.code === '55P03'
  );
  ok('same-workspace bucket collision is explicitly retryable');
  await control.begin(async (sql) => {
    await sql`update public.workspace_products set name='Independent bulk updated' where ws_id=${id(11)}`;
    const [{ count }] =
      await sql`select count(*) from pg_locks where pid=pg_backend_pid() and locktype='advisory' and granted`;
    assert(Number(count) <= 16);
    ok(
      'actual thousand-row concurrent workspace update holds at most sixteen keys'
    );
    const [{ count: updated }] =
      await sql`select count(*) from public.workspace_products where ws_id=${id(11)} and name='Independent bulk updated'`;
    assert.equal(Number(updated), 1001);
    ok('independent large write remains complete while merge is paused');
  });
  await assert.rejects(
    control`insert into private.inventory_products(product_id,warehouse_id,unit_id,amount) values(${id(50)},${id(31)},${id(21)},1)`,
    (e) => e.code === '55P03'
  );
  ok('same-identity writer fails fast');
  await assert.rejects(
    control`select private.apply_inventory_merge(${id(10)},'product',${id(52)},${id(51)},'unused','target','target',${id(1)})`,
    (e) => e.code === '55P03'
  );
  ok('concurrent workspace merge fails fast');
  assert.equal((await control`show lock_timeout`)[0].lock_timeout, '0');
  ok('failed advisory merge preserves caller timeout');
  assert.equal((await merging)[0].result.merged, true);
  ok('actual independent merge commits');
  assert.equal(
    Number(
      (
        await control`select amount from private.inventory_products where product_id=${id(51)} and unit_id=${id(21)}`
      )[0].amount
    ),
    10
  );
  ok('atomic intended combined stock');
  assert.equal(
    Number(
      (
        await control`select amount from private.inventory_products where product_id=${id(150)}`
      )[0].amount
    ),
    11
  );
  ok('concurrent unrelated quantity survives');
  assert.equal(
    (
      await control`select 1 from private.inventory_products where product_id=${id(50)}`
    ).length,
    0
  );
  ok('stale source stock absent');
  // A tuple lock without a writer advisory lock exercises the RPC's row-wait bound.
  let release;
  let reached;
  const gate = new Promise((r) => (release = r));
  const ready = new Promise((r) => (reached = r));
  const holder = writer.begin(async (sql) => {
    await sql`select id from public.workspace_products where id=${id(53)} for update`;
    reached();
    await gate;
  });
  await ready;
  try {
    await control.unsafe("set lock_timeout='750ms'");
    const started = Date.now();
    await assert.rejects(apply(control, 53), (e) => e.code === '55P03');
    ok('actual tuple contention rejects merge');
    assert(
      Date.now() - started < 1000,
      'Row wait must be bounded, not an unbounded RPC statement'
    );
    ok('row contention waits less than one second');
    assert.equal((await control`show lock_timeout`)[0].lock_timeout, '750ms');
    ok('row failure restores caller lock timeout');
  } finally {
    release();
    await holder;
  }
  const gate2 = new Promise((r) => (release = r));
  const ready2 = new Promise((r) => (reached = r));
  const editing = writer.begin(async (sql) => {
    await sql`update private.inventory_products set amount=amount+1 where product_id=${id(51)} and unit_id=${id(21)}`;
    reached();
    await gate2;
  });
  await ready2;
  try {
    await assert.rejects(apply(control, 53), (e) => e.code === '55P03');
    ok('merge rejects prior same-identity writer before snapshot');
  } finally {
    release();
    await editing;
  }
  // Setup is committed by another transaction: this cascade cannot pass merely
  // because the deleting client already acquired all of its identity keys.
  await control`insert into public.workspaces(id,name,personal,creator_id) values(${id(12)},'Cascade namespace',false,${id(1)})`;
  await control`insert into public.workspace_products(id,ws_id,name) values(${id(2500)},${id(12)},'Cascade product')`;
  await writer.begin(async (sql) => {
    await sql`delete from public.workspaces where id=${id(12)}`;
    const [{ count }] =
      await sql`select count(*) from pg_locks where pid=pg_backend_pid() and locktype='advisory' and granted`;
    assert.equal(Number(count), 0);
    ok('actual gone-workspace cascade acquires no identity namespace');
    assert.equal(
      (await sql`select id from public.workspace_products where id=${id(2500)}`)
        .length,
      0
    );
    ok('gone-workspace cascade still removes its owned product');
  });
  await assert.rejects(
    control`delete from public.workspace_products where id=${id(50)}`,
    (e) => e.code === '23514'
  );
  ok('ordinary live-workspace deletion retains merged identity guard');
  assert.equal(checks, 22);
} finally {
  await control.unsafe(
    'drop trigger if exists imc_pause_merge on private.inventory_identity_merges; drop function if exists private.imc_pause_merge();'
  );
  await control`delete from public.workspaces where id in (${id(10)},${id(11)})`;
  await control`delete from auth.users where id=${id(1)}`;
  await control.unsafe('drop function if exists public.imc_id(integer)');
  await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
}
