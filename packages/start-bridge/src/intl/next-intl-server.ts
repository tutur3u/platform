import nextIntlConfig from 'next-intl/config';
import type { AbstractIntlMessages } from 'use-intl';
import { createFormatter, createTranslator } from 'use-intl/core';
import { getRootParam } from '../next/root-params';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '../server/request-context';

/**
 * Generic `next-intl/server` for bridged apps. Like next-intl's own plugin,
 * the Vite preset aliases `next-intl/config` to the app's `i18n/request.ts`,
 * whose default export is `getRequestConfig(...)`; this module evaluates it
 * once per request. The request locale is `setRequestLocale`, then the root
 * `locale` param, then the `x-next-intl-locale` header.
 */
export interface BridgeRequestConfig {
  locale: string;
  messages?: AbstractIntlMessages;
  timeZone?: string;
  now?: Date;
  formats?: Record<string, unknown>;
}

export interface BridgeRequestConfigParams {
  requestLocale: Promise<string | undefined>;
  locale?: string;
}

type CreateRequestConfig = (
  params: BridgeRequestConfigParams
) => BridgeRequestConfig | Promise<BridgeRequestConfig>;

/** Identity, as in next-intl: the app's request config module exports it. */
export function getRequestConfig(create: CreateRequestConfig) {
  return create;
}

/** A promise carrying React's thenable status, so `use()` reads it in place. */
type TrackedConfig = Promise<BridgeRequestConfig> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: BridgeRequestConfig;
  reason?: unknown;
};

const requestLocale = createRequestLocal<string>('next-intl request locale');
const configs = createRequestLocal<Map<string, Promise<BridgeRequestConfig>>>(
  'next-intl request configs'
);

export function setRequestLocale(locale: string) {
  requestLocale.set(locale);
}

async function detectLocale(): Promise<string | undefined> {
  return requestLocale.get() ?? (await getRootParam('locale'));
}

function trackConfig(
  promise: Promise<BridgeRequestConfig>
): Promise<BridgeRequestConfig> {
  const tracked = promise as TrackedConfig;
  tracked.status = 'pending';
  tracked.then(
    (value) => {
      tracked.status = 'fulfilled';
      tracked.value = value;
    },
    (reason) => {
      tracked.status = 'rejected';
      tracked.reason = reason;
    }
  );
  return tracked;
}

// Returns the request's cached promise itself, never a fresh wrapper: an
// `async` wrapper made every RSC `use()` suspend, so Flight outlined each
// translated component as a lazy row, including Suspense fallbacks, which
// React's streaming renderer can leave unresolved.
function resolveConfig(locale?: string): Promise<BridgeRequestConfig> {
  const create = nextIntlConfig as unknown as CreateRequestConfig;
  const key = locale ?? '';
  const inRequest = maybeBridgeRequest() !== undefined;
  let cache = configs.get();
  if (!cache && inRequest) {
    cache = new Map();
    configs.set(cache);
  }
  const cached = cache?.get(key);
  if (cached) return cached;
  const pending = trackConfig(
    new Promise((resolve) =>
      resolve(create({ requestLocale: detectLocale(), locale }))
    )
  );
  cache?.set(key, pending);
  return pending;
}

/** The request's resolved config, memoized per locale (RSC `next-intl`). */
export function loadIntlConfig(locale?: string) {
  return resolveConfig(locale);
}

type LocaleInput = { locale?: string } | undefined;

export async function getLocale(): Promise<string> {
  return (await resolveConfig()).locale;
}
export async function getMessages(
  options?: LocaleInput
): Promise<AbstractIntlMessages> {
  return (await resolveConfig(options?.locale)).messages ?? {};
}
export async function getTimeZone(options?: LocaleInput) {
  return (await resolveConfig(options?.locale)).timeZone;
}
export async function getNow(options?: LocaleInput) {
  return (await resolveConfig(options?.locale)).now ?? new Date();
}
export async function getFormats() {
  return (await resolveConfig()).formats;
}
export async function getTranslations(
  input?: string | { locale?: string; namespace?: string }
) {
  const options = typeof input === 'string' ? { namespace: input } : input;
  const config = await resolveConfig(options?.locale);
  return createTranslator({
    locale: config.locale,
    messages: config.messages ?? {},
    namespace: options?.namespace,
    timeZone: config.timeZone,
    now: config.now,
  } as Parameters<typeof createTranslator>[0]);
}
export async function getFormatter(options?: LocaleInput) {
  const config = await resolveConfig(options?.locale);
  return createFormatter({
    locale: config.locale,
    timeZone: config.timeZone,
    now: config.now,
  });
}
