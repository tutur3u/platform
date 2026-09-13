/**
 * bun scripts/sync-polar-catalog.ts --mapping <json> --organization <id>
 * Review stdout, then use --apply --approve-plan <sha256> for that exact plan.
 * Pass --environment sandbox|production. Credentials stay in environment variables.
 * No subscriptions, customers, existing benefits, or database rows are directly mutated.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createPolarClient } from '../packages/payment/src/polar/server';
import {
  assertCatalogDatabaseSnapshot,
  CATALOG_KEYS,
  type CatalogMapping,
  planCatalogSync,
} from '../packages/payment-core/src/catalog-sync';
import canonicalProductIds from '../packages/payment-core/src/polar-workspace-product-ids.json';

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
async function main() {
  const mappingPath = option('--mapping');
  const organizationId = option('--organization');
  if (!mappingPath || !organizationId)
    throw new Error(
      'Provide --mapping and --organization. Dry-run is the default.'
    );
  if (!process.env.POLAR_ACCESS_TOKEN)
    throw new Error('POLAR_ACCESS_TOKEN is required');
  const raw: unknown = JSON.parse(await readFile(mappingPath, 'utf8'));
  if (
    !raw ||
    typeof raw !== 'object' ||
    CATALOG_KEYS.some(
      (key) =>
        !(key in raw) ||
        typeof (raw as Record<string, unknown>)[key] !== 'string'
    )
  ) {
    throw new Error(
      'Mapping must contain plus-month, plus-year, pro-month, and pro-year product IDs'
    );
  }
  const mapping = raw as CatalogMapping;
  const environment = option('--environment');
  if (environment !== 'sandbox' && environment !== 'production')
    throw new Error('Explicit --environment sandbox or production is required');
  if (
    environment === 'production' &&
    CATALOG_KEYS.some((key) => mapping[key] !== canonicalProductIds[key])
  )
    throw new Error(
      'Production mapping must match the reviewed public product bindings'
    );
  const polar = createPolarClient({ environment });
  const products = [];
  for (const key of CATALOG_KEYS)
    products.push(await polar.products.get({ id: mapping[key] }));
  const changes = planCatalogSync(products, mapping, organizationId);
  const plan = { environment, organizationId, changes };
  const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  console.log(
    JSON.stringify(
      { mode: 'preview', proposal: true, approvalHash: hash, ...plan },
      null,
      2
    )
  );
  if (!process.argv.includes('--apply')) return;
  if (option('--approve-plan') !== hash)
    throw new Error('Exact reviewed plan hash is required; no changes applied');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey)
    throw new Error(
      'Supabase verification credentials are required before applying'
    );
  const databaseUrl = new URL(supabaseUrl);
  if (
    databaseUrl.protocol !== 'https:' &&
    databaseUrl.hostname !== 'localhost' &&
    databaseUrl.hostname !== '127.0.0.1'
  ) {
    throw new Error('Supabase verification requires HTTPS outside localhost');
  }
  const preflightUrl = new URL(
    '/rest/v1/workspace_subscription_products',
    databaseUrl
  );
  preflightUrl.searchParams.set(
    'id',
    `in.(${changes.map((change) => change.productId).join(',')})`
  );
  preflightUrl.searchParams.set(
    'select',
    'id,price_per_seat,pricing_model,recurring_interval,tier,archived,min_seats,max_seats'
  );
  const preflightResponse = await fetch(preflightUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'private',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!preflightResponse.ok)
    throw new Error(
      `Database catalog preflight failed (${preflightResponse.status}); no provider changes applied`
    );
  const preflightRows: unknown = await preflightResponse.json();
  if (!Array.isArray(preflightRows))
    throw new Error('Invalid database catalog response');
  assertCatalogDatabaseSnapshot(changes, preflightRows);

  // Validate the entire refreshed catalog before the first write. Provider writes
  // are still sequential, so keep the per-product race check below as well.
  const refreshedProducts = [];
  for (const key of CATALOG_KEYS)
    refreshedProducts.push(await polar.products.get({ id: mapping[key] }));
  const refreshedChanges = planCatalogSync(
    refreshedProducts,
    mapping,
    organizationId
  );
  if (JSON.stringify(refreshedChanges) !== JSON.stringify(changes))
    throw new Error(
      'Catalog changed before apply; re-run preview. No provider changes applied'
    );

  for (const change of changes) {
    if (!change.needsUpdate) continue;
    // Re-read before each write. A changed price invalidates the reviewed plan.
    const latest = await polar.products.get({ id: change.productId });
    const refreshed = planCatalogSync(
      products.map((product) => (product.id === latest.id ? latest : product)),
      mapping,
      organizationId
    );
    const next = refreshed.find((item) => item.key === change.key);
    if (JSON.stringify(next) !== JSON.stringify(change))
      throw new Error(
        `Catalog changed during apply at ${change.key}; re-run preview`
      );
    const priorPrice = latest.prices.find(
      (price) => price.id === change.currentPriceId
    );
    await polar.products.update({
      id: change.productId,
      productUpdate: {
        metadata: {
          ...latest.metadata,
          catalog_key: change.key,
          catalog_version: change.catalogVersion,
        },
        // Polar retains existing subscriber pricing; replacing this list affects new purchases.
        prices: [
          {
            amountType: 'seat_based',
            priceCurrency: 'usd',
            taxBehavior:
              priorPrice && 'taxBehavior' in priorPrice
                ? priorPrice.taxBehavior
                : undefined,
            seatTiers: {
              tiers: [
                { minSeats: 1, maxSeats: null, pricePerSeat: change.amount },
              ],
            },
          },
        ],
      },
    });
    console.log(
      `Updated ${change.key}; waiting for existing webhook/cron reconciliation`
    );
  }
  for (const change of changes) {
    let verified = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const url = new URL(
        '/rest/v1/workspace_subscription_products',
        databaseUrl
      );
      url.searchParams.set('id', `eq.${change.productId}`);
      url.searchParams.set(
        'select',
        'id,price_per_seat,pricing_model,recurring_interval,tier,archived,min_seats,max_seats'
      );
      const response = await fetch(url, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Accept-Profile': 'private',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(
          `Database reconciliation read failed (${response.status}); provider changes may already be applied`
        );
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      const row = rows[0];
      if (
        rows.length === 1 &&
        row?.price_per_seat === change.amount &&
        row.pricing_model === 'seat_based' &&
        row.recurring_interval === change.interval &&
        row.tier === change.key.split('-')[0]?.toUpperCase() &&
        row.archived === false &&
        row.min_seats === 1 &&
        row.max_seats === null
      ) {
        verified = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!verified)
      throw new Error(
        `Database has not reconciled ${change.key}; do not publish the new catalog yet`
      );
  }
  if (environment === 'production') {
    const prices = {
      plus: { monthly: 0, annual: 0 },
      pro: { monthly: 0, annual: 0 },
    };
    for (const change of changes) {
      const tier = change.key.startsWith('plus') ? 'plus' : 'pro';
      prices[tier][change.interval === 'year' ? 'annual' : 'monthly'] =
        change.amount;
    }
    await writeFile(
      new URL(
        '../packages/payment-core/src/approved-workspace-prices.json',
        import.meta.url
      ),
      `${JSON.stringify({ version: changes[0]?.catalogVersion, currency: 'usd', prices, productIds: mapping }, null, 2)}\n`
    );
    console.log(
      'Provider and database verified; approved source prices updated. Review the source diff and validate checkout before deployment.'
    );
  } else console.log('Sandbox verified; production source prices unchanged.');
}
main().catch((error: unknown) => {
  // SDK failures may include request headers/body: do not print raw provider exceptions.
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : 'Catalog operation failed. Inspect provider status and re-run preview before retrying.'
  );
  process.exitCode = 1;
});
