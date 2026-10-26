// Minimal, dependency-free Supabase clients for the re-key job.
//
// SQL goes through the Management API query endpoint; Storage goes through the
// project Storage API with the service-role key, which is fetched into memory
// and never written anywhere. Errors are reduced to status/SQLSTATE codes so
// object names in upstream messages never reach logs.

import fs from 'node:fs';
import { assertPrivateFile } from './ledger.mjs';

const MANAGEMENT_API = 'https://api.supabase.com/v1';

export class OperationError extends Error {
  constructor(code, { retryable = false, status = null } = {}) {
    super(`Operation failed: ${code}`);
    this.name = 'OperationError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function readSecretFile(file, fsImpl = fs) {
  if (!file) throw new OperationError('secret_file_missing');
  assertPrivateFile(file, fsImpl);
  const value = fsImpl.readFileSync(file, 'utf8').trim();
  if (!value) throw new OperationError('secret_file_empty');
  return value;
}

/** SQL string literal; standard_conforming_strings is on in Supabase. */
export function lit(value) {
  if (value === null || value === undefined) return 'null';
  const text = String(value);
  if (text.includes('\u0000')) throw new OperationError('sql_literal_nul');
  return `'${text.replaceAll("'", "''")}'`;
}

function statusError(prefix, status) {
  return new OperationError(`${prefix}_http_${status}`, {
    retryable: status === 429 || status >= 500,
    status,
  });
}

function sqlstateFrom(message) {
  const match = /ERROR:\s+([0-9A-Z]{5}):/.exec(String(message ?? ''));
  return match ? match[1] : 'unknown';
}

async function request(fetchImpl, url, init, prefix) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new OperationError(`${prefix}_network`, { retryable: true });
  }
  return response;
}

export function createSqlClient({
  projectRef,
  accessToken,
  fetchImpl = fetch,
}) {
  const url = `${MANAGEMENT_API}/projects/${projectRef}/database/query`;
  async function run(query, { readOnly }) {
    const response = await request(
      fetchImpl,
      url,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query, read_only: readOnly }),
      },
      'sql'
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 400) {
        throw new OperationError(`sql_${sqlstateFrom(body?.message)}`);
      }
      throw statusError('sql', response.status);
    }
    return Array.isArray(body) ? body : [];
  }
  return {
    read: (query) => run(query, { readOnly: true }),
    write: (query) => run(query, { readOnly: false }),
  };
}

export async function fetchServiceRoleKey({
  projectRef,
  accessToken,
  fetchImpl = fetch,
}) {
  const response = await request(
    fetchImpl,
    `${MANAGEMENT_API}/projects/${projectRef}/api-keys?reveal=true`,
    { headers: { authorization: `Bearer ${accessToken}` } },
    'api_keys'
  );
  if (!response.ok) throw statusError('api_keys', response.status);
  const keys = await response.json();
  const key = (
    keys.find?.((entry) => entry.type === 'secret') ??
    keys.find?.(
      (entry) =>
        entry.name === 'service_role' &&
        (entry.type === 'legacy' || entry.type === undefined)
    )
  )?.api_key;
  if (!key) throw new OperationError('service_role_key_unavailable');
  return key;
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

export function storageAuthHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    ...(serviceKey.startsWith('eyJ')
      ? { authorization: `Bearer ${serviceKey}` }
      : {}),
  };
}

export function createStorageClient({
  projectRef,
  serviceKey,
  bucket,
  baseUrl = `https://${projectRef}.supabase.co`,
  fetchImpl = fetch,
}) {
  const headers = {
    ...storageAuthHeaders(serviceKey),
    'content-type': 'application/json',
  };
  return {
    async copy(sourceKey, destinationKey) {
      const response = await request(
        fetchImpl,
        `${baseUrl}/storage/v1/object/copy`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bucketId: bucket,
            sourceKey,
            destinationKey,
            copyMetadata: true,
          }),
        },
        'copy'
      );
      if (!response.ok) throw statusError('copy', response.status);
      const body = await response.json().catch(() => ({}));
      return { id: body.Id ?? body.id ?? null };
    },
    async remove(keys) {
      const response = await request(
        fetchImpl,
        `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,
        { method: 'DELETE', headers, body: JSON.stringify({ prefixes: keys }) },
        'delete'
      );
      if (!response.ok) throw statusError('delete', response.status);
      const body = await response.json().catch(() => []);
      return { removed: Array.isArray(body) ? body.length : 0 };
    },
    // Staging-only probe helpers. The engine refuses to call them in production.
    async sign(key, expiresIn) {
      const response = await request(
        fetchImpl,
        `${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeKey(key)}`,
        { method: 'POST', headers, body: JSON.stringify({ expiresIn }) },
        'sign'
      );
      if (!response.ok) throw statusError('sign', response.status);
      const body = await response.json();
      return `${baseUrl}/storage/v1${body.signedURL}`;
    },
    async headStatus(url) {
      // HEAD only: the probe never downloads object bytes.
      const response = await request(
        fetchImpl,
        url,
        { method: 'HEAD' },
        'head'
      );
      return response.status;
    },
  };
}

export async function withRetry(
  operation,
  { attempts = 3, baseDelayMs = 500, sleep } = {}
) {
  const wait =
    sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt === attempts) break;
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
