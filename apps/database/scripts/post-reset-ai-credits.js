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
import { pathToFileURL } from 'node:url';

const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
const ONE_MILLION_CREDITS = 1_000_000;
const MIN_MAX_OUTPUT_TOKENS = 8_192;
const UPSERT_BATCH_SIZE = 100;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_ADMIN_FETCH_MAX_ATTEMPTS = 6;
const DEFAULT_ADMIN_FETCH_RETRY_DELAY_MS = 1_000;
const PRIVATE_SCHEMA_REST_HEADERS = {
  'Accept-Profile': 'private',
  'Content-Profile': 'private',
};

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

function resolveGatewayModelMaxTokens(model) {
  if (model?.id === 'google/gemini-embedding-2') {
    return 3072;
  }

  return model?.max_tokens ?? null;
}

function truncateText(value, maxLength) {
  if (typeof value !== 'string') return value ?? null;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
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
  const maxAttempts = 15;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
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

      if (supabaseBaseUrl && serviceRoleKey) {
        return { supabaseBaseUrl, serviceRoleKey };
      }
    } catch (e) {
      if (attempt === maxAttempts) {
        throw e;
      }
    }
    console.log(
      `⏳ Supabase not ready yet, waiting for container to start (attempt ${attempt}/${maxAttempts})...`
    );
    execFileSync('sleep', ['2']);
  }
  throw new Error(
    'Could not resolve local Supabase API URL or SERVICE_ROLE_KEY from `supabase status` after multiple attempts.'
  );
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSupabaseRequestError(response, path, body) {
  return new Error(
    `Supabase request failed (${response.status} ${response.statusText}) on ${path}: ${body}`
  );
}

function isRetryableSupabaseRestError(response, body) {
  if (![502, 503, 504].includes(response.status)) {
    return false;
  }

  return (
    body.includes('"code":"PGRST002"') ||
    body.includes('PGRST002') ||
    body.toLowerCase().includes('schema cache')
  );
}

function isRetryableFetchError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'AbortError' ||
    /fetch failed|connection refused|econnrefused|econnreset|socket|terminated/iu.test(
      error.message
    )
  );
}

async function adminFetch(
  baseUrl,
  serviceRoleKey,
  path,
  init = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  options = {}
) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_ADMIN_FETCH_MAX_ATTEMPTS;
  const retryDelayMs =
    options.retryDelayMs ?? DEFAULT_ADMIN_FETCH_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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

      if (response.ok) {
        return response;
      }

      const body = await response.text().catch(() => '');
      const retryable = isRetryableSupabaseRestError(response, body);

      if (!retryable || attempt === maxAttempts) {
        throw createSupabaseRequestError(response, path, body);
      }

      console.warn(
        `Supabase REST schema cache not ready for ${path}; retrying (${attempt}/${maxAttempts})...`
      );
      await sleep(retryDelayMs * attempt);
    } catch (error) {
      if (!isRetryableFetchError(error) || attempt === maxAttempts) {
        throw error;
      }

      console.warn(
        `Supabase REST request failed for ${path}; retrying (${attempt}/${maxAttempts})...`
      );
      await sleep(retryDelayMs * attempt);
    }
  }

  throw new Error(`Supabase request retry loop exhausted for ${path}.`);
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
    name: truncateText(model.name || modelName || model.id, 128),
    provider: truncateText(provider, 64),
    description: truncateText(model.description, 512),
    type: truncateText(model.type || 'language', 64),
    context_window: model.context_window ?? null,
    max_tokens: resolveGatewayModelMaxTokens(model),
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
          ...PRIVATE_SCHEMA_REST_HEADERS,
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
        ...PRIVATE_SCHEMA_REST_HEADERS,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        is_enabled: true,
      }),
    }
  );
}

function pickExistingModelId(availableModelIds, preferredIds) {
  for (const preferredId of preferredIds) {
    if (availableModelIds.has(preferredId)) {
      return preferredId;
    }
  }

  return null;
}

async function normalizeAllocations(
  baseUrl,
  serviceRoleKey,
  availableModelIds
) {
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

  const defaultsByTier = {
    FREE: {
      default_language_model: pickExistingModelId(availableModelIds, [
        'google/gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite',
      ]),
      default_image_model: pickExistingModelId(availableModelIds, [
        'google/imagen-4.0-fast-generate-001',
        'google/imagen-4.0-generate-001',
      ]),
    },
    PLUS: {
      default_language_model: pickExistingModelId(availableModelIds, [
        'google/gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite',
      ]),
      default_image_model: pickExistingModelId(availableModelIds, [
        'google/imagen-4.0-generate-001',
        'google/imagen-4.0-fast-generate-001',
      ]),
    },
    PRO: {
      default_language_model: pickExistingModelId(availableModelIds, [
        'google/gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite',
      ]),
      default_image_model: pickExistingModelId(availableModelIds, [
        'google/imagen-4.0-generate-001',
        'google/imagen-4.0-fast-generate-001',
      ]),
    },
    ENTERPRISE: {
      default_language_model: pickExistingModelId(availableModelIds, [
        'google/gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite',
      ]),
      default_image_model: pickExistingModelId(availableModelIds, [
        'google/imagen-4.0-generate-001',
        'google/imagen-4.0-fast-generate-001',
      ]),
    },
  };

  for (const [tier, defaults] of Object.entries(defaultsByTier)) {
    await adminFetch(
      baseUrl,
      serviceRoleKey,
      `/rest/v1/ai_credit_plan_allocations?tier=eq.${tier}`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(defaults),
      }
    );
  }
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
  const availableModelIds = new Set(rows.map((row) => row.id));
  await enableAllGatewayModels(supabaseBaseUrl, serviceRoleKey);
  await normalizeAllocations(
    supabaseBaseUrl,
    serviceRoleKey,
    availableModelIds
  );

  console.log(`✅ Synced ${syncedCount} gateway models`);
  console.log('✅ Enabled all gateway models');
  console.log(
    `✅ Normalized all plan allocations: monthly=${ONE_MILLION_CREDITS}, daily=${ONE_MILLION_CREDITS}, max_output_tokens=${MIN_MAX_OUTPUT_TOKENS}, allowed_models=ALL, default models refreshed`
  );
  console.log('\n✅ Post-reset AI credits bootstrap complete.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error('\n❌ Post-reset AI credits bootstrap failed');
    console.error(
      `   ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}

export {
  adminFetch,
  createSupabaseRequestError,
  isRetryableFetchError,
  isRetryableSupabaseRestError,
};
