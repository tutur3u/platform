// Run only against the dedicated disposable Inventory test project, never ordinary DB.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../../../packages/inventory-core/package.json', import.meta.url)
);
const postgres = require('postgres');
const port = Number(process.argv[2]);
assert.equal(port, 14098, 'Only the admitted disposable port is permitted');
const clients = Array.from({ length: 3 }, () =>
  postgres({
    host: '127.0.0.1',
    port,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres',
    max: 1,
  })
);
const [control, edit, checkout] = clients;
const id = (n) => `90100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ws = id(2),
  actor = id(1),
  product = id(8),
  period = id(9),
  unit = id(6),
  warehouse = id(7);
try {
  await control.begin(async (sql) => {
    await sql`insert into auth.users(id,email) values(${actor},'rule-race@example.test')`;
    await sql`insert into public.users(id,display_name) values(${actor},'Synthetic race actor') on conflict(id) do nothing`;
    await sql`insert into public.workspaces(id,name,creator_id,personal) values(${ws},'Synthetic rule race',${actor},false)`;
    await sql`insert into public.workspace_users(id,ws_id,display_name) values(${id(3)},${ws},'Synthetic operator')`;
    await sql`insert into public.workspace_configs(ws_id,id,value) values(${ws},'DEFAULT_CURRENCY','VND')`;
    await sql`insert into public.transaction_categories(id,ws_id,name) values(${id(4)},${ws},'Synthetic income')`;
    await sql`insert into private.workspace_wallets(id,ws_id,name,currency) values(${id(5)},${ws},'Synthetic wallet','VND')`;
    await sql`insert into private.inventory_units(id,ws_id,name) values(${unit},${ws},'Item')`;
    await sql`insert into private.inventory_warehouses(id,ws_id,name) values(${warehouse},${ws},'Synthetic booth')`;
    await sql`insert into public.product_categories(id,ws_id,name) values(${id(12)},${ws},'Synthetic merchandise')`;
    await sql`insert into private.inventory_owners(id,ws_id,name) values(${id(13)},${ws},'Synthetic owner')`;
    await sql`insert into public.workspace_products(id,ws_id,name,category_id,owner_id) values(${product},${ws},'Synthetic blocked item',${id(12)},${id(13)})`;
    await sql`insert into private.inventory_products(product_id,unit_id,warehouse_id,amount,price) values(${product},${unit},${warehouse},8,99000)`;
    await sql`insert into private.inventory_sales_periods(id,ws_id,name,pricing_mode,time_zone,starts_at,ends_at,product_scope) values(${period},${ws},'Synthetic current period','scheduled','UTC',current_date,current_date,'blocklist')`;
    await sql`insert into private.inventory_sales_period_products(ws_id,period_id,product_id) values(${ws},${period},${product})`;
    await sql`select private.author_inventory_period_price(${ws},${period},${actor},${product},${unit},${warehouse},'VND',60000,current_date,null)`;
  });
  await control.unsafe(`create function private.synthetic_rule_pause() returns trigger language plpgsql as $$ begin
  if new.period_id='${period}' then perform pg_advisory_lock(901021); perform pg_sleep(1); perform pg_advisory_unlock(901021); end if; return new; end; $$;
  create trigger synthetic_rule_pause before insert on private.inventory_sales_period_products for each row execute function private.synthetic_rule_pause();`);
  const editing =
    edit`select private.update_inventory_scheduled_period(${ws},${period},'{}',${edit.json([product])})`.then(
      () => {}
    );
  const deadline = Date.now() + 5000;
  while (true) {
    const locks =
      await control`select 1 from pg_locks where locktype='advisory' and objid=901021`;
    if (locks.length) break;
    assert(
      Date.now() < deadline,
      'Editor failed to reach paused replacement boundary'
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const [quote] =
    await control`select id from private.inventory_product_prices where period_id=${period}`;
  const started = Date.now();
  await assert.rejects(
    checkout`select private.create_inventory_period_invoice(${ws},${actor},${id(3)},${period},${id(10)},'VND',${checkout.json({ content: 'Synthetic blocked sale', wallet_id: id(5), category_id: id(4) })},${checkout.json([{ product_id: product, unit_id: unit, warehouse_id: warehouse, quantity: 1, price: 60000, price_id: quote.id }])})`,
    (error) =>
      error.code === '23514' &&
      error.message === 'Sale does not match the sales period product rules'
  );
  assert(
    Date.now() - started >= 500,
    'Checkout must wait through the rule replacement'
  );
  await editing;
  console.log(
    'ok 1 - concurrent checkout waits for atomic blocklist replacement and rejects blocked product'
  );
  const [result] =
    await control`select (select count(*) from public.finance_invoices where ws_id=${ws}) as invoices,(select amount from private.inventory_products where product_id=${product}) as amount,(select count(*) from private.inventory_sales_period_products where period_id=${period}) as rules`;
  assert.equal(Number(result.invoices), 0);
  assert.equal(Number(result.amount), 8);
  console.log('ok 2 - concurrent edit creates no invoice or stock consumption');
  assert.equal(Number(result.rules), 1);
  console.log('ok 3 - intended blocked rule survives replacement');
} finally {
  await control.unsafe(
    'drop trigger if exists synthetic_rule_pause on private.inventory_sales_period_products; drop function if exists private.synthetic_rule_pause();'
  );
  await control`delete from public.finance_invoice_products where invoice_id in (select id from public.finance_invoices where ws_id=${ws})`;
  await control`delete from public.finance_invoices where ws_id=${ws}`;
  await control`delete from public.workspaces where id=${ws}`;
  await control`delete from auth.users where id=${actor}`;
  await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
}
