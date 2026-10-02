// Synthetic lock/transition regressions; only the admitted disposable DB is allowed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../../../../packages/inventory-core/package.json', import.meta.url)
);
const postgres = require('postgres');
const port = Number(process.argv[2]);
assert.equal(port, 14098);
const clients = ['control', 'edit', 'checkout'].map((name) =>
  postgres({
    host: '127.0.0.1',
    port,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres',
    max: 1,
    connection: { application_name: `inventory-transition-${name}` },
  })
);
const [control, edit, checkout] = clients;
const id = (n) => `90200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ws = id(2),
  actor = id(1),
  product = id(8),
  period = id(9),
  unit = id(6),
  warehouse = id(7),
  legacy = id(14);
const stock = [
  { unit_id: unit, warehouse_id: warehouse, amount: 10, price: 99000 },
];
const sale = (request) =>
  checkout`select private.create_inventory_period_invoice(${ws},${actor},${id(3)},${legacy},${id(request)},'VND',${checkout.json({ content: 'Synthetic mixed mode sale', wallet_id: id(5), category_id: id(4) })},${checkout.json([{ product_id: product, unit_id: unit, warehouse_id: warehouse, quantity: 1, price: 99000 }])})`;
const changeStock = (inventory) =>
  edit`select private.edit_inventory_priced_product(${ws},${product},'{}',${edit.json(inventory)},${id(3)},'{}',true)`;
async function waitFor(query, label) {
  const deadline = Date.now() + 5000;
  while (!(await query()).length) {
    assert(Date.now() < deadline, label);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function pauseProduct() {
  await control`select pg_advisory_lock(902021)`;
  await control.unsafe(`create function private.synthetic_product_pause() returns trigger language plpgsql as $$ begin
    if new.id='${product}' then perform pg_advisory_lock(902021); perform pg_advisory_unlock(902021); end if; return new; end $$;
    create trigger synthetic_product_pause before update on public.workspace_products for each row execute function private.synthetic_product_pause();`);
}
async function unpauseProduct() {
  await control`select pg_advisory_unlock(902021)`;
}
async function dropProductPause() {
  await control.unsafe(
    'drop trigger if exists synthetic_product_pause on public.workspace_products; drop function if exists private.synthetic_product_pause();'
  );
}
let fixedDefinition;
try {
  await control.begin(async (sql) => {
    await sql`insert into auth.users(id,email) values(${actor},'transition-race@example.test')`;
    await sql`insert into public.users(id,display_name) values(${actor},'Synthetic transition actor') on conflict(id) do nothing`;
    await sql`insert into public.workspaces(id,name,creator_id,personal) values(${ws},'Synthetic transitions',${actor},false)`;
    await sql`insert into public.workspace_users(id,ws_id,display_name) values(${id(3)},${ws},'Operator')`;
    await sql`insert into public.workspace_configs(ws_id,id,value) values(${ws},'DEFAULT_CURRENCY','VND')`;
    await sql`insert into public.transaction_categories(id,ws_id,name) values(${id(4)},${ws},'Revenue')`;
    await sql`insert into private.workspace_wallets(id,ws_id,name,currency) values(${id(5)},${ws},'Wallet','VND')`;
    await sql`insert into private.inventory_units(id,ws_id,name) values(${unit},${ws},'Item')`;
    await sql`insert into private.inventory_warehouses(id,ws_id,name) values(${warehouse},${ws},'Booth')`;
    await sql`insert into public.product_categories(id,ws_id,name) values(${id(12)},${ws},'Merchandise')`;
    await sql`insert into private.inventory_owners(id,ws_id,name) values(${id(13)},${ws},'Owner')`;
    await sql`insert into public.workspace_products(id,ws_id,name,category_id,owner_id) values(${product},${ws},'Synthetic item',${id(12)},${id(13)})`;
    await sql`insert into private.inventory_products(product_id,unit_id,warehouse_id,amount,price) values(${product},${unit},${warehouse},8,99000)`;
    await sql`insert into private.inventory_sales_periods(id,ws_id,name,pricing_mode,time_zone,starts_at,ends_at,product_scope) values(${period},${ws},'Scheduled','scheduled','UTC',current_date,current_date,'all'),(${legacy},${ws},'Legacy','legacy','UTC',current_date,current_date,'all')`;
    await sql`select private.author_inventory_period_price(${ws},${period},${actor},${product},${unit},${warehouse},'VND',60000,current_date,null)`;
  });
  const [definition] =
    await control`select pg_get_functiondef('private.edit_inventory_priced_product(uuid,uuid,jsonb,jsonb,uuid,jsonb,boolean)'::regprocedure) as sql`;
  fixedDefinition = definition.sql;
  const stockLock =
    ' perform 1 from private.inventory_products where product_id=p_product_id order by unit_id,warehouse_id for update;';
  assert(fixedDefinition.includes(stockLock));
  // Reproduce b210088's precise inversion only inside the disposable fixture.
  const oldDefinition = fixedDefinition
    .replace(`${stockLock}\n`, '')
    .replace(' for v_old in select', `${stockLock}\n for v_old in select`);
  await control.unsafe(oldDefinition);
  await pauseProduct();
  const oldEdit = changeStock(stock).then(
    () => null,
    (error) => error
  );
  await waitFor(
    () =>
      control`select 1 from pg_locks where locktype='advisory' and objid=902021 and not granted`,
    'Old edit did not pause after locking product'
  );
  const oldSale = sale(20).then(
    () => null,
    (error) => error
  );
  await waitFor(
    () =>
      control`select 1 from pg_stat_activity where application_name='inventory-transition-checkout' and wait_event_type='Lock'`,
    'Old checkout did not wait on product'
  );
  await unpauseProduct();
  const oldResults = await Promise.all([oldEdit, oldSale]);
  assert(
    oldResults.some((error) => error?.code === '40P01'),
    'Old ordering must reproduce a deadlock'
  );
  console.log(
    'ok 1 - published mixed legacy checkout/priced edit inversion reproduces 40P01'
  );
  await dropProductPause();
  await control.unsafe(fixedDefinition);
  await control`update private.inventory_products set amount=8 where product_id=${product}`;
  await pauseProduct();
  const fixedEdit = changeStock(stock).then((value) => value);
  await waitFor(
    () =>
      control`select 1 from pg_locks where locktype='advisory' and objid=902021 and not granted`,
    'Fixed edit did not pause'
  );
  const fixedSale = sale(21);
  const started = Date.now();
  const runningSale = fixedSale.then((value) => value);
  await waitFor(
    () =>
      control`select 1 from pg_stat_activity where application_name='inventory-transition-checkout' and wait_event_type='Lock'`,
    'Fixed checkout did not wait on stock'
  );
  await unpauseProduct();
  await Promise.all([fixedEdit, runningSale]);
  assert(Date.now() - started < 5000);
  console.log(
    'ok 2 - corrected mixed-mode edit and checkout both commit without deadlock'
  );
  const [result] =
    await control`select amount from private.inventory_products where product_id=${product}`;
  assert.equal(Number(result.amount), 9);
  const [saved] =
    await control`select count(*) as count from private.inventory_sale_price_snapshots where request_id=${id(21)}`;
  assert.equal(Number(saved.count), 1);
  console.log(
    'ok 3 - corrected checkout records one receipt and one stock consumption'
  );
  await dropProductPause();
  // First quote must wait for an ordinary unpriced tuple removal, then reject.
  await control`delete from private.inventory_product_prices where product_id=${product}`;
  await pauseProduct();
  const removing = changeStock([]).then((value) => value);
  await waitFor(
    () =>
      control`select 1 from pg_locks where locktype='advisory' and objid=902021 and not granted`,
    'Unpriced edit did not pause'
  );
  const authoring =
    checkout`select private.author_inventory_period_price(${ws},${period},${actor},${product},${unit},${warehouse},'VND',60000,current_date,null)`.then(
      () => null,
      (error) => error
    );
  await waitFor(
    () =>
      control`select 1 from pg_stat_activity where application_name='inventory-transition-checkout' and wait_event_type='Lock'`,
    'First authoring did not wait for stock edit'
  );
  await unpauseProduct();
  await removing;
  const authorError = await authoring;
  assert.equal(authorError?.code, '23514');
  const [prices] =
    await control`select count(*) as count from private.inventory_product_prices where product_id=${product}`;
  assert.equal(Number(prices.count), 0);
  console.log(
    'ok 4 - first-price authoring serializes with unpriced tuple removal and rejects absent tuple'
  );
  await dropProductPause();
  // A legacy edit arriving during conversion uses the locked transaction too.
  await control`update private.inventory_sales_periods set product_scope='blocklist' where id=${legacy}`;
  await control`insert into private.inventory_sales_period_products(ws_id,period_id,product_id) values(${ws},${legacy},${product})`;
  await control`select pg_advisory_lock(902022)`;
  await control.unsafe(`create function private.synthetic_conversion_pause() returns trigger language plpgsql as $$ begin
    if new.id='${legacy}' and old.pricing_mode='legacy' and new.pricing_mode='scheduled' then perform pg_advisory_lock(902022); perform pg_advisory_unlock(902022); end if; return new; end $$;
    create trigger synthetic_conversion_pause before update on private.inventory_sales_periods for each row execute function private.synthetic_conversion_pause();`);
  const converting =
    edit`select private.update_inventory_scheduled_period(${ws},${legacy},' {"pricing_mode":"scheduled"}',null)`.then(
      (value) => value
    );
  await waitFor(
    () =>
      control`select 1 from pg_locks where locktype='advisory' and objid=902022 and not granted`,
    'Conversion did not pause'
  );
  const rules =
    checkout`select private.update_inventory_scheduled_period(${ws},${legacy},'{"description":"Concurrent old-client edit"}',${checkout.json([product])})`.then(
      (value) => value
    );
  await waitFor(
    () =>
      control`select 1 from pg_stat_activity where application_name='inventory-transition-checkout' and wait_event_type='Lock'`,
    'Concurrent legacy edit did not wait on conversion'
  );
  await control`select pg_advisory_unlock(902022)`;
  await Promise.all([converting, rules]);
  const [converted] =
    await control`select pricing_mode,(select count(*) from private.inventory_sales_period_products where period_id=${legacy}) as rules from private.inventory_sales_periods where id=${legacy}`;
  assert.equal(converted.pricing_mode, 'scheduled');
  assert.equal(Number(converted.rules), 1);
  console.log(
    'ok 5 - in-flight legacy rule edit serializes with conversion and preserves scheduled mode/rules'
  );
} finally {
  await control`select pg_advisory_unlock_all()`;
  await dropProductPause();
  await control.unsafe(
    'drop trigger if exists synthetic_conversion_pause on private.inventory_sales_periods; drop function if exists private.synthetic_conversion_pause();'
  );
  if (fixedDefinition) await control.unsafe(fixedDefinition);
  await control`delete from public.finance_invoice_products where invoice_id in (select id from public.finance_invoices where ws_id=${ws})`;
  await control`delete from public.finance_invoices where ws_id=${ws}`;
  await control`delete from public.workspaces where id=${ws}`;
  await control`delete from auth.users where id=${actor}`;
  await Promise.all(clients.map((sql) => sql.end({ timeout: 5 })));
}
