#!/usr/bin/env node

/**
 * Post-reset AI credits bootstrap for local Supabase.
 *
 * Runs after `supabase db reset` to:
 * 1) Sync latest gateway models from Vercel AI Gateway.
 * 2) Enable all synced gateway models.
 * 3) Set all plan allocations to:
 *    - monthly_credits = 1,000,000
 *    - daily_limit = 1,000,000
 *    - max_output_tokens_per_request = 8,192
 *    - allowed_models = [] (means "all models")
 */

import { execFileSync } from 'node:child_process';

const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
const ONE_MILLION_CREDITS = 1_000_000;
const MIN_MAX_OUTPUT_TOKENS = 8_192;
const UPSERT_BATCH_SIZE = 100;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

function parseHttpsBaseUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function isImageGenModelId(id) {
  return (
    id.startsWith('google/imagen-') || id === 'google/gemini-2.5-flash-image'
  );
}

function parseNumber(value, fallback = null) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStatusValue(status, ...candidates) {
  for (const key of candidates) {
    const value = status[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const loweredEntries = Object.entries(status).map(([k, v]) => [
    k.toLowerCase(),
    v,
  ]);
  for (const key of candidates) {
    const target = key.toLowerCase();
    const matched = loweredEntries.find(([entryKey]) => entryKey === target);
    if (
      matched &&
      typeof matched[1] === 'string' &&
      matched[1].trim().length > 0
    ) {
      return matched[1].trim();
    }
  }

  return null;
}

function getLocalSupabaseStatus() {
  const output = execFileSync('bun', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const parsed = JSON.parse(output);
  const supabaseUrlRaw = getStatusValue(
    parsed,
    'API_URL',
    'api_url',
    'apiUrl',
    'SUPABASE_URL',
    'supabase_url'
  );
  const serviceRoleKey = getStatusValue(
    parsed,
    'SERVICE_ROLE_KEY',
    'service_role_key',
    'serviceRoleKey'
  );
  const supabaseBaseUrl = supabaseUrlRaw
    ? parseHttpsBaseUrl(supabaseUrlRaw)
    : null;

  if (!supabaseBaseUrl || !serviceRoleKey) {
    throw new Error(
      'Could not resolve local Supabase API URL or SERVICE_ROLE_KEY from `supabase status`.'
    );
  }

  return { supabaseBaseUrl, serviceRoleKey };
}

async function fetchWithTimeout(
  url,
  init = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', abortFromCaller, {
        once: true,
      });
    }
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function adminFetch(
  baseUrl,
  serviceRoleKey,
  path,
  init = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
) {
  const response = await fetchWithTimeout(
    `${baseUrl}${path}`,
    {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    },
    timeoutMs
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Supabase request failed (${response.status} ${response.statusText}) on ${path}: ${body}`
    );
  }

  return response;
}

async function fetchGatewayModels(timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const response = await fetchWithTimeout(
    GATEWAY_MODELS_URL,
    undefined,
    timeoutMs
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch gateway models (${response.status} ${response.statusText}).`
    );
  }

  const json = await response.json();
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  throw new Error(
    `Unexpected gateway models payload (${response.status}): ${JSON.stringify(json)}`
  );
}

function mapGatewayModel(model) {
  const provider = model?.owned_by || model?.id?.split('/')?.[0] || 'unknown';
  const modelName = model?.id?.split('/')?.slice(1).join('/') || model?.id;

  return {
    id: model.id,
    name: model.name || modelName || model.id,
    provider,
    description: model.description || null,
    type: model.type || 'language',
    context_window: model.context_window ?? null,
    max_tokens: model.max_tokens ?? null,
    tags: Array.isArray(model.tags) ? model.tags : [],
    input_price_per_token: parseNumber(model?.pricing?.input, 0),
    output_price_per_token: parseNumber(model?.pricing?.output, 0),
    input_tiers: model?.pricing?.input_tiers ?? null,
    output_tiers: model?.pricing?.output_tiers ?? null,
    cache_read_price_per_token: parseNumber(
      model?.pricing?.input_cache_read,
      null
    ),
    cache_write_price_per_token: parseNumber(
      model?.pricing?.input_cache_write,
      null
    ),
    web_search_price: parseNumber(model?.pricing?.web_search, null),
    search_price: parseNumber(model?.pricing?.web_search, null),
    image_gen_price:
      parseNumber(model?.pricing?.image, null) ??
      (isImageGenModelId(model.id) ? 0.0001 : null),
    released_at:
      typeof model?.released === 'number'
        ? new Date(model.released * 1000).toISOString()
        : null,
    pricing_raw: model?.pricing ?? null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertGatewayModels(baseUrl, serviceRoleKey, rows) {
  if (rows.length === 0) return 0;

  let synced = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    await adminFetch(
      baseUrl,
      serviceRoleKey,
      '/rest/v1/ai_gateway_models?on_conflict=id',
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      }
    );
    synced += batch.length;
  }

  return synced;
}

async function enableAllGatewayModels(baseUrl, serviceRoleKey) {
  await adminFetch(
    baseUrl,
    serviceRoleKey,
    '/rest/v1/ai_gateway_models?id=not.is.null',
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        is_enabled: true,
      }),
    }
  );
}

async function normalizeAllocations(baseUrl, serviceRoleKey) {
  await adminFetch(
    baseUrl,
    serviceRoleKey,
    '/rest/v1/ai_credit_plan_allocations?tier=not.is.null',
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        monthly_credits: ONE_MILLION_CREDITS,
        daily_limit: ONE_MILLION_CREDITS,
        max_output_tokens_per_request: MIN_MAX_OUTPUT_TOKENS,
        allowed_models: [],
      }),
    }
  );
}

async function main() {
  console.log('\n🔄 Post-reset AI credits bootstrap...\n');

  const { supabaseBaseUrl, serviceRoleKey } = getLocalSupabaseStatus();
  const models = await fetchGatewayModels();
  const rows = models
    .filter((model) => model && typeof model.id === 'string')
    .map(mapGatewayModel);

  const syncedCount = await upsertGatewayModels(
    supabaseBaseUrl,
    serviceRoleKey,
    rows
  );
  await enableAllGatewayModels(supabaseBaseUrl, serviceRoleKey);
  await normalizeAllocations(supabaseBaseUrl, serviceRoleKey);

  console.log(`✅ Synced ${syncedCount} gateway models`);
  console.log('✅ Enabled all gateway models');
  console.log(
    `✅ Normalized all plan allocations: monthly=${ONE_MILLION_CREDITS}, daily=${ONE_MILLION_CREDITS}, max_output_tokens=${MIN_MAX_OUTPUT_TOKENS}, allowed_models=ALL`
  );
  console.log('\n✅ Post-reset AI credits bootstrap complete.\n');
}

main().catch((error) => {
  console.error('\n❌ Post-reset AI credits bootstrap failed');
  console.error(
    `   ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
