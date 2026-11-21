// Read-only provider billing adapters. Each returns the normalized lines for
// one UTC usage day, aggregated so a day stays within the RPC line limit.

export const MAX_COST_LINES_PER_DAY = 2_000;
export const MAX_GITHUB_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_VERCEL_RESPONSE_BYTES = 48 * 1024 * 1024;
export const MAX_VERCEL_ROWS = 60_000;

export type CostEnvironment = 'ci' | 'preview' | 'production' | 'shared';

export interface CostLine {
  app_id: string;
  billed_amount_usd: number;
  environment: CostEnvironment;
  /** Null when the provider reports no list price. */
  list_amount_usd: number | null;
  quantity: number;
  service: string;
  sku: string;
  unit: string;
}

export interface SourceRequest {
  day: string;
  fetch: typeof fetch;
  signal: AbortSignal;
  userAgent: string;
}

export interface CostSource {
  accountId: string;
  provider: 'github' | 'vercel';
  read: (request: SourceRequest) => Promise<CostLine[]>;
}

export interface CostSourceEnv {
  COST_GITHUB_ORG?: string;
  COST_GITHUB_TOKEN?: string;
  COST_VERCEL_API_TOKEN?: string;
  COST_VERCEL_TEAM_ID?: string;
}

/** A provider day exceeded the collector's response or line budget. */
export class CostBudgetError extends Error {
  override name = 'CostBudgetError';
}

export type SourceFailure = 'http' | 'shape';

/**
 * A provider request failed or returned an unusable body. Its message is a
 * fixed category, never provider response content, so it is safe to log.
 */
export class CostSourceError extends Error {
  override name = 'CostSourceError';
  constructor(
    readonly category: SourceFailure,
    readonly status?: number
  ) {
    super(`Provider billing ${category}`);
  }
}

const ACCOUNT_PATTERN = /^[a-zA-Z0-9_.-]{1,128}$/u;

const DECIMAL = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/u;

/** A finite amount from a number or decimal string, or null. */
function amount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && DECIMAL.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function required(value: unknown): number {
  const parsed = amount(value);
  if (parsed === null) throw new CostSourceError('shape');
  return parsed;
}

const ROUTING_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;

/**
 * The usage day a row is routed by: a real calendar date, optionally with a
 * valid timestamp. A row without one fails the whole day, so a malformed
 * response cannot replace good lines with a partial snapshot.
 */
export function routingDay(value: unknown): string {
  const match = typeof value === 'string' ? ROUTING_DATE.exec(value) : null;
  if (!match) throw new CostSourceError('shape');
  const [, year, month, date, time] = match;
  const calendar = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(date))
  );
  if (
    calendar.getUTCFullYear() !== Number(year) ||
    calendar.getUTCMonth() !== Number(month) - 1 ||
    calendar.getUTCDate() !== Number(date) ||
    (time !== undefined && !Number.isFinite(Date.parse(String(value))))
  )
    throw new CostSourceError('shape');
  return `${year}-${month}-${date}`;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new CostSourceError('shape');
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

class LineAggregator {
  readonly #lines = new Map<string, CostLine>();

  add(line: CostLine) {
    if (
      line.quantity === 0 &&
      !line.list_amount_usd &&
      line.billed_amount_usd === 0
    )
      return;
    const key = JSON.stringify([
      line.service,
      line.sku,
      line.app_id,
      line.environment,
      line.unit,
    ]);
    const existing = this.#lines.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.list_amount_usd =
        existing.list_amount_usd === null && line.list_amount_usd === null
          ? null
          : (existing.list_amount_usd ?? 0) + (line.list_amount_usd ?? 0);
      existing.billed_amount_usd += line.billed_amount_usd;
      return;
    }
    if (this.#lines.size >= MAX_COST_LINES_PER_DAY)
      throw new CostBudgetError('Provider day exceeds the cost line limit');
    this.#lines.set(key, { ...line });
  }

  lines() {
    return [...this.#lines.values()];
  }
}

async function readCapped(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new CostSourceError('shape');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes)
        throw new CostBudgetError('Provider response too large');
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

async function* cappedLines(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new CostSourceError('shape');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes)
        throw new CostBudgetError('Provider response too large');
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        yield pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
    }
    pending += decoder.decode();
    if (pending.trim()) yield pending;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

function assertOk(response: Response) {
  if (response.ok) return;
  void response.body?.cancel().catch(() => undefined);
  throw new CostSourceError('http', response.status);
}

export function githubSource(org: string, token: string): CostSource {
  return {
    accountId: org,
    provider: 'github',
    async read({ day, fetch, signal, userAgent }) {
      const [year, month, date] = day.split('-').map(Number);
      const url = new URL(
        `https://api.github.com/organizations/${encodeURIComponent(org)}/settings/billing/usage`
      );
      url.searchParams.set('year', String(year));
      url.searchParams.set('month', String(month));
      url.searchParams.set('day', String(date));
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': userAgent,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'manual',
        signal,
      });
      assertOk(response);
      const body = parseJson(
        await readCapped(response, MAX_GITHUB_RESPONSE_BYTES)
      );
      const items =
        typeof body === 'object' && body !== null && 'usageItems' in body
          ? body.usageItems
          : null;
      if (!Array.isArray(items)) throw new CostSourceError('shape');
      const lines = new LineAggregator();
      for (const item of items) {
        if (typeof item !== 'object' || item === null)
          throw new CostSourceError('shape');
        const record = item as Record<string, unknown>;
        if (routingDay(record.date) !== day) continue;
        const product = text(record.product, 160) || 'unknown';
        lines.add({
          app_id: text(record.repositoryName, 128),
          billed_amount_usd: required(record.netAmount),
          environment: product === 'actions' ? 'ci' : 'shared',
          list_amount_usd: required(record.grossAmount),
          quantity: amount(record.quantity) ?? 0,
          service: product,
          sku: text(record.sku, 160),
          unit: text(record.unitType, 64),
        });
      }
      return lines.lines();
    },
  };
}

function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

// FOCUS rows cover one provider billing day that starts in the morning UTC.
// A row belongs to the usage day its charge period starts on, so a UTC day
// window returns the previous day's row as well and that row is skipped.
export function vercelSource(teamId: string, token: string): CostSource {
  return {
    accountId: teamId,
    provider: 'vercel',
    async read({ day, fetch, signal, userAgent }) {
      const url = new URL('https://api.vercel.com/v1/billing/charges');
      url.searchParams.set('teamId', teamId);
      url.searchParams.set('from', `${day}T00:00:00.000Z`);
      url.searchParams.set('to', nextDay(day));
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent },
        redirect: 'manual',
        signal,
      });
      assertOk(response);
      const lines = new LineAggregator();
      let rows = 0;
      for await (const raw of cappedLines(
        response,
        MAX_VERCEL_RESPONSE_BYTES
      )) {
        if (!raw.trim()) continue;
        rows += 1;
        if (rows > MAX_VERCEL_ROWS)
          throw new CostBudgetError('Vercel row limit');
        const parsed = parseJson(raw);
        if (typeof parsed !== 'object' || parsed === null)
          throw new CostSourceError('shape');
        const record = parsed as Record<string, unknown>;
        if (routingDay(record.ChargePeriodStart) !== day) continue;
        const tags =
          typeof record.Tags === 'object' && record.Tags !== null
            ? (record.Tags as Record<string, unknown>)
            : {};
        lines.add({
          app_id: text(tags.ProjectName, 128),
          billed_amount_usd: required(record.BilledCost),
          environment: 'shared',
          // FOCUS ListCost is the public price; EffectiveCost is amortized
          // spend, so it is not used as a list amount.
          list_amount_usd: amount(record.ListCost),
          quantity: amount(record.ConsumedQuantity) ?? 0,
          service: text(record.ServiceName, 160) || 'unknown',
          sku: text(record.SkuId, 160),
          unit: text(record.ConsumedUnit, 64),
        });
      }
      return lines.lines();
    },
  };
}

/** Sources whose collector credentials are configured; never logs values. */
export function configuredCostSources(env: CostSourceEnv): CostSource[] {
  const sources: CostSource[] = [];
  const org = env.COST_GITHUB_ORG?.trim();
  if (org && ACCOUNT_PATTERN.test(org) && env.COST_GITHUB_TOKEN)
    sources.push(githubSource(org, env.COST_GITHUB_TOKEN));
  const team = env.COST_VERCEL_TEAM_ID?.trim();
  if (team && ACCOUNT_PATTERN.test(team) && env.COST_VERCEL_API_TOKEN)
    sources.push(vercelSource(team, env.COST_VERCEL_API_TOKEN));
  return sources;
}
