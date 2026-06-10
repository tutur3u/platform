import 'server-only';

import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, ThreadInfo } from '@tuturuuu/ai/chat-sdk';
import type { BrowserContext, Page } from 'playwright';

export type ZaloPersonalWebSyncStatus =
  | 'completed'
  | 'failed'
  | 'partial'
  | 'waiting_for_phone';

export interface ZaloPersonalWebSyncMessage {
  authorId: string;
  authorName: string;
  id: string;
  isSelf: boolean;
  text: string;
  threadId: string;
  threadTitle: string;
  threadType: 'group' | 'user';
  timestamp: number;
}

export interface ZaloPersonalWebSyncResult {
  approvalRequested: boolean;
  conversations: number;
  error: string | null;
  groupMessages: number;
  messages: Message<ZaloPersonalWebSyncMessage>[];
  missingRanges: number;
  requestAccepted: boolean;
  status: ZaloPersonalWebSyncStatus;
  threads: ThreadInfo[];
  userMessages: number;
}

export interface ZaloPersonalWebSyncOptions {
  agentId: string;
  channelDisplayName: string;
  channelId: string;
  cookieJson: string;
  imei: string;
  ownId?: string | null;
  userAgent: string;
  maxConversations?: number;
  maxMessagesPerConversation?: number;
  syncTimeoutMs?: number;
}

const ZALO_WEB_URL = 'https://chat.zalo.me/';
const DEFAULT_SYNC_TIMEOUT_MS = 120_000;

type BrowserCookie = {
  domain?: string;
  expirationDate?: number | string;
  expires?: number | string;
  httpOnly?: boolean;
  key?: string;
  name?: string;
  path?: string;
  sameSite?: string;
  secure?: boolean;
  value?: string;
};

type PlaywrightModule = typeof import('playwright');

interface BrowserCounts {
  conversations: number;
  messages: number;
  missingRanges: number;
  ownId: string | null;
  previewMessages: number;
}

export async function syncZaloPersonalWebHistory({
  agentId,
  channelId,
  cookieJson,
  imei,
  syncTimeoutMs = DEFAULT_SYNC_TIMEOUT_MS,
  userAgent,
}: ZaloPersonalWebSyncOptions): Promise<ZaloPersonalWebSyncResult> {
  const playwright = await loadPlaywright();
  const profileDir = await getProfileDir(agentId, channelId);
  const context = await playwright.chromium.launchPersistentContext(
    profileDir,
    {
      headless: true,
      userAgent,
    }
  );

  try {
    await seedZaloWebSession(context, {
      cookieJson,
      imei,
    });

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(ZALO_WEB_URL, {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(8_000);

    if (await isZaloWebLoginPage(page)) {
      return emptyWebSyncResult({
        error: 'zalo_personal_web_sync_login_required',
        status: 'failed',
      });
    }

    const syncStarted = await clickZaloWebSyncButton(page);
    const counts = await waitForZaloWebSync(page, syncTimeoutMs);
    const status = counts.missingRanges > 0 ? 'waiting_for_phone' : 'completed';

    return {
      approvalRequested: syncStarted,
      conversations: counts.conversations,
      error:
        status === 'completed'
          ? null
          : 'zalo_personal_web_sync_waiting_for_phone',
      groupMessages: 0,
      messages: [],
      missingRanges: counts.missingRanges,
      requestAccepted: syncStarted || counts.missingRanges === 0,
      status,
      threads: [],
      userMessages: 0,
    };
  } catch (error) {
    return emptyWebSyncResult({
      error:
        error instanceof Error
          ? normalizeWebSyncError(error.message)
          : normalizeWebSyncError(String(error)),
      status: 'failed',
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

function emptyWebSyncResult({
  error,
  status,
}: {
  error: string | null;
  status: ZaloPersonalWebSyncStatus;
}): ZaloPersonalWebSyncResult {
  return {
    approvalRequested: false,
    conversations: 0,
    error,
    groupMessages: 0,
    messages: [],
    missingRanges: 0,
    requestAccepted: false,
    status,
    threads: [],
    userMessages: 0,
  };
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return await import('playwright');
  } catch {
    throw new Error('zalo_personal_web_sync_browser_unavailable');
  }
}

async function getProfileDir(agentId: string, channelId: string) {
  const safeKey = `${agentId}-${channelId}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const dir = join(tmpdir(), 'tuturuuu-zalo-personal-web-sync', safeKey);

  await mkdir(dir, { recursive: true });

  return dir;
}

async function seedZaloWebSession(
  context: BrowserContext,
  {
    cookieJson,
    imei,
  }: {
    cookieJson: string;
    imei: string;
  }
) {
  const cookies = parseBrowserCookies(cookieJson);

  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }

  await context.addInitScript((storedImei) => {
    window.localStorage.setItem('imei', storedImei);
    window.localStorage.setItem('z_uuid', storedImei);
    window.localStorage.setItem('zclientid', storedImei);
  }, imei);
}

function parseBrowserCookies(cookieJson: string) {
  const parsed = JSON.parse(cookieJson) as
    | BrowserCookie[]
    | { cookies?: BrowserCookie[] };
  const rawCookies = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.cookies)
      ? parsed.cookies
      : [];
  const nowSeconds = Math.floor(Date.now() / 1000);

  return rawCookies.flatMap((cookie) => {
    const name = cookie.name ?? cookie.key;
    const expires = parseCookieExpires(cookie.expirationDate ?? cookie.expires);

    if (
      !name ||
      !cookie.value ||
      expires === 0 ||
      (expires > 0 && expires <= nowSeconds)
    ) {
      return [];
    }

    const base = {
      expires,
      httpOnly: Boolean(cookie.httpOnly),
      name: String(name),
      path: String(cookie.path || '/'),
      sameSite: parseCookieSameSite(cookie.sameSite),
      secure: cookie.secure !== false,
      value: String(cookie.value),
    };
    const domain = String(cookie.domain || '.zalo.me');
    const variants = new Set([domain]);

    if (!domain.startsWith('.')) variants.add(`.${domain}`);

    return [...variants].map((variant) => ({
      ...base,
      domain: variant,
    }));
  });
}

function parseCookieExpires(value: BrowserCookie['expires']) {
  if (value === null || value === undefined) return -1;
  if (typeof value === 'number') {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
  }

  const parsed = Date.parse(String(value));

  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : -1;
}

function parseCookieSameSite(value: BrowserCookie['sameSite']) {
  const normalized = String(value ?? '').toLowerCase();

  if (normalized === 'strict') return 'Strict' as const;
  if (normalized === 'none') return 'None' as const;

  return 'Lax' as const;
}

async function isZaloWebLoginPage(page: Page) {
  const url = page.url();
  const body = await page
    .locator('body')
    .innerText({ timeout: 2000 })
    .catch(() => '');

  return (
    url.includes('id.zalo.me') ||
    /Đăng nhập tài khoản Zalo|Login Zalo account|Đăng nhập qua mã QR/i.test(
      body
    )
  );
}

async function clickZaloWebSyncButton(page: Page) {
  const syncButton = page.locator('.sync-v2-ok.suggestNewSync').first();

  if ((await syncButton.count()) === 0) return false;

  await syncButton.click({ timeout: 5000 }).catch(() => undefined);

  return true;
}

async function waitForZaloWebSync(
  page: Page,
  timeoutMs: number
): Promise<BrowserCounts> {
  const startedAt = Date.now();
  let latest = await readZaloWebCounts(page);

  while (Date.now() - startedAt < timeoutMs) {
    const body = await page
      .locator('body')
      .innerText({ timeout: 2000 })
      .catch(() => '');

    latest = await readZaloWebCounts(page);

    if (
      latest.missingRanges === 0 ||
      /Đồng bộ tin nhắn thành công|Message sync completed/i.test(body)
    ) {
      return latest;
    }

    await page.waitForTimeout(2500);
  }

  return latest;
}

async function readZaloWebCounts(page: Page): Promise<BrowserCounts> {
  return await page.evaluate(async () => {
    const ownDb = (await indexedDB.databases())
      .map((db) => db.name)
      .find((name) => name?.startsWith('zdb_'));
    const ownId = ownDb?.replace(/^zdb_/, '') ?? null;

    async function count(dbName: string, storeName: string) {
      return await new Promise<number>((resolve) => {
        const open = indexedDB.open(dbName);

        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;

          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(0);
            return;
          }

          const tx = db.transaction(storeName, 'readonly');
          const request = tx.objectStore(storeName).count();

          request.onerror = () => resolve(0);
          request.onsuccess = () => {
            const value = request.result;
            db.close();
            resolve(value);
          };
        };
      });
    }

    return {
      conversations: ownId ? await count(`zdb_${ownId}`, 'conversation') : 0,
      messages: ownId ? await count(`zdb_${ownId}`, 'message') : 0,
      missingRanges: ownId
        ? await count(`sync_${ownId}`, 'missing_message_range')
        : 0,
      ownId,
      previewMessages: ownId
        ? await count(`zdb_${ownId}`, 'preview_message')
        : 0,
    };
  });
}

function normalizeWebSyncError(message: string) {
  if (message.startsWith('zalo_personal_web_sync_')) return message;
  if (/Executable doesn't exist|browserType.launch/i.test(message)) {
    return 'zalo_personal_web_sync_browser_unavailable';
  }
  if (/Timeout/i.test(message)) {
    return 'zalo_personal_web_sync_timed_out';
  }

  return 'zalo_personal_web_sync_failed';
}
