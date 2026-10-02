import 'server-only';

import { createHash } from 'node:crypto';
import { reserveSecurityBudget } from './security-budget';
import {
  getSecurityBudgetPolicy,
  type SecurityBudgetPolicy,
  scaledSecurityBudgetLimit,
} from './security-budget-policy';
import {
  StorageDownloadError,
  type StorageDownloadTicket,
} from './storage-download-token';

const GiB = 1024 ** 3;

function limit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new StorageDownloadError(
      'Storage download protection is unavailable',
      503
    );
  }
  return value;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function reserveStorageDownloadBudget(
  ticket: StorageDownloadTicket,
  bytes?: number
) {
  if (process.env.STORAGE_DOWNLOADS_DISABLED === 'true') {
    throw new StorageDownloadError(
      'Storage downloads are temporarily disabled',
      503
    );
  }
  if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 0)) {
    throw new StorageDownloadError('Unable to determine download size', 502);
  }
  let policy: SecurityBudgetPolicy;
  try {
    policy = await getSecurityBudgetPolicy({ workspaceId: ticket.wsId });
  } catch {
    throw new StorageDownloadError(
      'Storage download protection is unavailable',
      503
    );
  }
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const minute = Math.floor(now.getTime() / 60_000);
  // File identity, not the randomized ticket or caller IP: fresh links and IP
  // rotation share the same bucket. All workspace limits share a global cap.
  const file = hash(new URL(ticket.url).pathname);
  const workspace = hash(ticket.wsId);
  const prefix = 'storage-download:v1';
  const dimensions =
    bytes === undefined
      ? ([
          [
            `${prefix}:requests:${minute}`,
            1,
            limit('STORAGE_DOWNLOAD_REQUESTS_PER_MINUTE', 3000),
            120,
          ],
          [
            `${prefix}:file:${file}:${minute}`,
            1,
            scaledSecurityBudgetLimit(
              limit('STORAGE_DOWNLOAD_FILE_REQUESTS_PER_MINUTE', 10),
              policy
            ),
            120,
          ],
        ] as const)
      : ([
          [
            `${prefix}:bytes:${day}`,
            bytes,
            limit('STORAGE_DOWNLOAD_GLOBAL_DAILY_BYTES', 5 * GiB),
            172800,
          ],
          [
            `${prefix}:bytes:${month}`,
            bytes,
            limit('STORAGE_DOWNLOAD_GLOBAL_MONTHLY_BYTES', 100 * GiB),
            32 * 86400,
          ],
          [
            `${prefix}:workspace:${workspace}:${day}`,
            bytes,
            scaledSecurityBudgetLimit(
              limit(
                'STORAGE_DOWNLOAD_FREE_WORKSPACE_DAILY_BYTES',
                256 * 1024 ** 2
              ),
              policy,
              limit(
                'STORAGE_DOWNLOAD_WORKSPACE_DAILY_BYTES',
                limit('STORAGE_DOWNLOAD_GLOBAL_DAILY_BYTES', 5 * GiB)
              )
            ),
            172800,
          ],
        ] as const);
  const freeDimensions =
    policy.tier === 'FREE'
      ? bytes === undefined
        ? [
            [
              `${prefix}:free-requests:${minute}`,
              1,
              limit('STORAGE_DOWNLOAD_FREE_REQUESTS_PER_MINUTE', 500),
              120,
            ] as const,
          ]
        : [
            [
              `${prefix}:free-bytes:${day}`,
              bytes,
              limit('STORAGE_DOWNLOAD_FREE_DAILY_BYTES', 512 * 1024 ** 2),
              172800,
            ] as const,
            [
              `${prefix}:free-bytes:${month}`,
              bytes,
              limit('STORAGE_DOWNLOAD_FREE_MONTHLY_BYTES', 5 * GiB),
              32 * 86400,
            ] as const,
          ]
      : [];
  try {
    const result = await reserveSecurityBudget([
      ...dimensions,
      ...freeDimensions,
    ]);
    if (!Array.isArray(result) || result.length !== 2 || result[0] !== 1) {
      if (Array.isArray(result) && result[0] === 0) {
        const nextDay = Date.parse(`${day}T00:00:00Z`) + 86400_000;
        const nextMonth = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          1
        );
        const reset =
          bytes === undefined
            ? (minute + 1) * 60_000
            : result[1] === 2 || result[1] === 5
              ? nextMonth
              : nextDay;
        throw new StorageDownloadError(
          'Storage download limit exceeded',
          429,
          Math.max(1, Math.ceil((reset - now.getTime()) / 1000))
        );
      }
      throw new Error('Invalid limiter response');
    }
  } catch (error) {
    if (error instanceof StorageDownloadError) throw error;
    // Never log the upstream URL, encrypted bearer ticket, or database credentials.
    throw new StorageDownloadError(
      'Storage download protection is unavailable',
      503
    );
  }
}
