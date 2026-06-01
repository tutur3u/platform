import 'server-only';

import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { Agent, type Dispatcher, fetch as undiciFetch } from 'undici';

const MAX_HTML_BYTES = 256 * 1024;
const PREVIEW_TIMEOUT_MS = 3500;

export type PreviewFetch = (
  input: URL,
  init: {
    cache: 'no-store';
    dispatcher: Dispatcher;
    headers: Record<string, string>;
    redirect: 'manual';
    signal: AbortSignal;
  }
) => Promise<Response>;

export type PreviewResolver = (hostname: string) => Promise<LookupAddress[]>;
export type PreviewDispatcherFactory = (record: LookupAddress) => Dispatcher;

export interface PreviewFetchDependencies {
  createDispatcher: PreviewDispatcherFactory;
  fetchImpl: PreviewFetch;
  resolveHost: PreviewResolver;
}

export interface ChatLinkPreviewResult {
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  title: string | null;
  url: string;
}

export function normalizeChatPreviewUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

export async function fetchChatLinkPreview(
  inputUrl: string
): Promise<ChatLinkPreviewResult> {
  return fetchChatLinkPreviewWithDependencies(inputUrl, {
    createDispatcher: createPinnedDispatcher,
    fetchImpl: undiciFetch as unknown as PreviewFetch,
    resolveHost: resolvePreviewHost,
  });
}

export async function fetchChatLinkPreviewWithDependencies(
  inputUrl: string,
  dependencies: PreviewFetchDependencies
): Promise<ChatLinkPreviewResult> {
  let url = new URL(normalizeChatPreviewUrl(inputUrl));

  for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
    const address = await resolveSafePreviewAddress(
      url,
      dependencies.resolveHost
    );
    const dispatcher = dependencies.createDispatcher(address);

    try {
      const response = await dependencies.fetchImpl(url, {
        cache: 'no-store',
        dispatcher,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Tuturuuu-Chat-LinkPreview/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;

        url = new URL(location, url);
        url = new URL(normalizeChatPreviewUrl(url.toString()));
        continue;
      }

      if (!response.ok) {
        throw new Error(`preview_fetch_failed:${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        return {
          description: null,
          imageUrl: null,
          siteName: url.hostname,
          title: url.hostname,
          url: url.toString(),
        };
      }

      const html = await readLimitedText(response);
      return parsePreviewHtml(html, url);
    } finally {
      await closeDispatcher(dispatcher);
    }
  }

  throw new Error('preview_redirect_limit');
}

export async function resolveSafePreviewAddress(
  url: URL,
  resolveHost: PreviewResolver = resolvePreviewHost
) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('preview_url_scheme_forbidden');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('preview_url_host_forbidden');
  }

  const records = await resolveHost(url.hostname);
  if (records.length === 0) {
    throw new Error('preview_url_network_forbidden');
  }

  if (records.some((record) => isPrivatePreviewIp(record.address))) {
    throw new Error('preview_url_network_forbidden');
  }

  return records[0] as LookupAddress;
}

async function resolvePreviewHost(hostname: string) {
  const ipLiteral = normalizeIpLiteral(hostname);
  const ipVersion = net.isIP(ipLiteral);

  if (ipVersion) {
    return [
      {
        address: ipLiteral,
        family: ipVersion,
      },
    ];
  }

  return lookup(hostname, { all: true, verbatim: true });
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    isPrivatePreviewIp(normalized)
  );
}

export function isPrivatePreviewIp(value: string) {
  const ip = normalizeIpLiteral(value);
  const mappedIpv4 = getIpv4FromMappedIpv6(ip);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  const ipVersion = net.isIP(ip);
  if (ipVersion === 0) return false;

  if (ipVersion === 6) {
    const normalized = ip.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8')
    );
  }

  return isPrivateIpv4(ip);
}

function isPrivateIpv4(value: string) {
  const parts = value.split('.').map((part) => Number(part));
  const [a, b] = parts;
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    a === undefined ||
    b === undefined
  ) {
    return true;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeIpLiteral(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function getIpv4FromMappedIpv6(value: string) {
  const normalized = normalizeIpLiteral(value);
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (dotted && net.isIP(dotted) === 4) return dotted;

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (!hex) return null;

  const high = Number.parseInt(hex[1] as string, 16);
  const low = Number.parseInt(hex[2] as string, 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join('.');
}

function createPinnedDispatcher(record: LookupAddress) {
  return new Agent({
    connect: {
      lookup: ((
        _hostname: string,
        _options: unknown,
        callback: (
          error: NodeJS.ErrnoException | null,
          address: string,
          family: number
        ) => void
      ) => {
        callback(null, record.address, record.family);
      }) as never,
    },
  });
}

async function closeDispatcher(dispatcher: Dispatcher) {
  await dispatcher.close().catch(() => null);
}

async function readLimitedText(response: Response) {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;

    const remaining = MAX_HTML_BYTES - bytes;
    const chunk = value.length > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    bytes += chunk.length;
  }

  await reader.cancel().catch(() => null);
  return new TextDecoder().decode(concatChunks(chunks, bytes));
}

function concatChunks(chunks: Uint8Array[], totalLength: number) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function parsePreviewHtml(html: string, url: URL): ChatLinkPreviewResult {
  const title =
    getMetaContent(html, 'property', 'og:title') ||
    getMetaContent(html, 'name', 'twitter:title') ||
    getTitle(html) ||
    url.hostname;
  const description =
    getMetaContent(html, 'property', 'og:description') ||
    getMetaContent(html, 'name', 'description') ||
    getMetaContent(html, 'name', 'twitter:description');
  const siteName =
    getMetaContent(html, 'property', 'og:site_name') || url.hostname;
  return {
    description: cleanText(description, 800),
    imageUrl: null,
    siteName: cleanText(siteName, 120),
    title: cleanText(title, 300),
    url: url.toString(),
  };
}

function getMetaContent(html: string, attrName: string, attrValue: string) {
  const tagPattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${attrName}=["']${escapeRegExp(attrValue)}["'])[^>]*>`,
    'iu'
  );
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return null;

  return readAttribute(tag, 'content');
}

function getTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  return title ? decodeHtmlEntities(title) : null;
}

function readAttribute(tag: string, name: string) {
  const value = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'iu'))?.[1];
  return value ? decodeHtmlEntities(value) : null;
}

function cleanText(value: string | null, maxLength: number) {
  if (!value) return null;

  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
