import { randomUUID } from 'node:crypto';
import type { ZaloPersonalQrScannedProfile } from '@tuturuuu/ai/chat-sdk/zalo-personal';
import type { AiAgentZaloAccountMode } from './types';

export type AiAgentZaloPersonalQrLoginStatus =
  | 'pending'
  | 'qr_generated'
  | 'scanned'
  | 'credentials_ready'
  | 'authenticated'
  | 'persisted'
  | 'expired'
  | 'declined'
  | 'aborted'
  | 'failed';

export interface AiAgentZaloPersonalQrLoginSession {
  agentId: string;
  channelId: string;
  createdAt: string;
  error: string | null;
  expiresAt: string | null;
  mode: AiAgentZaloAccountMode;
  ownId: string | null;
  qrImageDataUrl: string | null;
  scannedProfile: ZaloPersonalQrScannedProfile | null;
  sessionId: string;
  status: AiAgentZaloPersonalQrLoginStatus;
  updatedAt: string;
}

export type QrSessionRecord = {
  abort?: () => unknown;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  ready: Promise<void>;
  readyResolved: boolean;
  resolveReady: () => void;
  session: AiAgentZaloPersonalQrLoginSession;
};

type GlobalWithZaloPersonalQrLoginSessions = typeof globalThis & {
  __tuturuuuAiAgentZaloPersonalQrLoginSessions?: Map<string, QrSessionRecord>;
};

const QR_SESSION_READY_TIMEOUT_MS = 25_000;
const QR_SESSION_CLEANUP_MS = 5 * 60_000;
const activeStatuses = new Set<AiAgentZaloPersonalQrLoginStatus>([
  'pending',
  'qr_generated',
  'scanned',
  'credentials_ready',
  'authenticated',
]);

export function getQrSessionMap() {
  const scope = globalThis as GlobalWithZaloPersonalQrLoginSessions;

  scope.__tuturuuuAiAgentZaloPersonalQrLoginSessions ??= new Map<
    string,
    QrSessionRecord
  >();

  return scope.__tuturuuuAiAgentZaloPersonalQrLoginSessions;
}

export function createQrSessionRecord(agentId: string, channelId: string) {
  let resolveReady: () => void = () => undefined;
  const createdAt = new Date().toISOString();
  const record: QrSessionRecord = {
    cleanupTimer: null,
    ready: new Promise<void>((resolve) => {
      resolveReady = resolve;
    }),
    readyResolved: false,
    resolveReady,
    session: {
      agentId,
      channelId,
      createdAt,
      error: null,
      expiresAt: null,
      mode: 'personal',
      ownId: null,
      qrImageDataUrl: null,
      scannedProfile: null,
      sessionId: randomUUID(),
      status: 'pending',
      updatedAt: createdAt,
    },
  };

  return record;
}

export function touchQrSession(
  record: QrSessionRecord,
  update: Partial<AiAgentZaloPersonalQrLoginSession>
) {
  record.session = {
    ...record.session,
    ...update,
    updatedAt: new Date().toISOString(),
  };

  if (!record.readyResolved && record.session.status !== 'pending') {
    record.readyResolved = true;
    record.resolveReady();
  }
}

export function abortQrSessionRecord(record: QrSessionRecord) {
  touchQrSession(record, {
    error: 'zalo_personal_qr_aborted',
    qrImageDataUrl: null,
    status: 'aborted',
  });
  record.abort?.();
}

export function publicQrSession(session: AiAgentZaloPersonalQrLoginSession) {
  return {
    ...session,
    scannedProfile: session.scannedProfile
      ? { ...session.scannedProfile }
      : null,
  };
}

export function isActiveQrSessionStatus(
  status: AiAgentZaloPersonalQrLoginStatus
) {
  return activeStatuses.has(status);
}

export function isTerminalQrFailureStatus(
  status: AiAgentZaloPersonalQrLoginStatus
) {
  return status === 'aborted' || status === 'declined' || status === 'expired';
}

export function scheduleQrSessionCleanup(
  key: string,
  record: QrSessionRecord,
  sessions: Map<string, QrSessionRecord>
) {
  if (record.cleanupTimer) {
    clearTimeout(record.cleanupTimer);
  }

  record.cleanupTimer = setTimeout(() => {
    if (sessions.get(key) === record) {
      sessions.delete(key);
    }
  }, QR_SESSION_CLEANUP_MS);
  if (typeof record.cleanupTimer === 'object') {
    (record.cleanupTimer as { unref?: () => void }).unref?.();
  }
}

export async function waitForQrSessionReady(record: QrSessionRecord) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  await Promise.race([
    record.ready,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, QR_SESSION_READY_TIMEOUT_MS);
      if (typeof timer === 'object') {
        (timer as { unref?: () => void }).unref?.();
      }
    }),
  ]);

  if (timer) {
    clearTimeout(timer);
  }
}
