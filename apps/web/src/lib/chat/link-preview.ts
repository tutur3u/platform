import 'server-only';

import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_HTML_BYTES = 256 * 1024;
const PREVIEW_TIMEOUT_MS = 3500;

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
  let url = new URL(normalizeChatPreviewUrl(inputUrl));
  await assertSafePreviewUrl(url);

  for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
    const response = await fetch(url, {
      cache: 'no-store',
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
      await assertSafePreviewUrl(url);
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
  }

  throw new Error('preview_redirect_limit');
}

async function assertSafePreviewUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('preview_url_scheme_forbidden');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('preview_url_host_forbidden');
  }

  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error('preview_url_network_forbidden');
  }
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    isPrivateIp(normalized)
  );
}

function isPrivateIp(value: string) {
  const ipVersion = net.isIP(value);
  if (ipVersion === 0) return false;

  if (ipVersion === 6) {
    const normalized = value.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  const parts = value.split('.').map((part) => Number(part));
  const [a, b] = parts;
  if (parts.length !== 4 || a === undefined || b === undefined) return true;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
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
  const image =
    getMetaContent(html, 'property', 'og:image') ||
    getMetaContent(html, 'name', 'twitter:image');

  return {
    description: cleanText(description, 800),
    imageUrl: image ? toSafeAbsoluteUrl(image, url) : null,
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

function toSafeAbsoluteUrl(value: string, baseUrl: URL) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return normalizeChatPreviewUrl(url.toString());
  } catch {
    return null;
  }
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
