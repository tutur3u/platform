import type { ProcessorContext } from '../types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ENCODER = new TextEncoder();
const MAX_ROWS = 100;
const MAX_RESPONSE_BYTES = 64 * 1024;
const TABLE =
  /^[a-z][a-z0-9-]{4,62}\.[A-Za-z0-9_]{1,128}\.[A-Za-z0-9_]{1,128}_REALTIME$/u;
const ISSUE_ID = /^[a-f0-9]{32}$/u;

export const SOURCE_LAG_MS = 5 * 60_000;

export type Platform = 'ios' | 'android';
export interface IssueCounts {
  platform: Platform;
  issueId: string;
  build: number;
  firstAt: number;
  recent: number;
  previous: number;
}

function settings(raw: string) {
  const source: unknown = JSON.parse(raw);
  if (!source || typeof source !== 'object') throw new Error('config');
  const {
    client_email,
    private_key,
    project_id,
    location,
    ios_table,
    android_table,
  } = source as Record<string, unknown>;
  if (
    typeof client_email !== 'string' ||
    !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/u.test(client_email) ||
    typeof private_key !== 'string' ||
    !private_key.startsWith('-----BEGIN PRIVATE KEY-----') ||
    typeof project_id !== 'string' ||
    !/^[a-z][a-z0-9-]{4,62}$/u.test(project_id) ||
    typeof location !== 'string' ||
    !/^[a-zA-Z0-9-]{1,48}$/u.test(location) ||
    typeof ios_table !== 'string' ||
    typeof android_table !== 'string' ||
    !TABLE.test(ios_table) ||
    !TABLE.test(android_table) ||
    ios_table === android_table
  )
    throw new Error('config');
  return {
    client_email,
    private_key,
    project_id,
    location,
    ios_table,
    android_table,
  };
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

async function assertion(email: string, pem: string, now: number) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s+/gu, '')), (c) =>
      c.charCodeAt(0)
    ),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const iat = Math.floor(now / 1000);
  const encode = (value: object) =>
    base64url(ENCODER.encode(JSON.stringify(value)));
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: email,
    aud: TOKEN_URL,
    scope: 'https://www.googleapis.com/auth/bigquery',
    iat,
    exp: iat + 300,
  })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    ENCODER.encode(input)
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

async function cappedJson(response: Response): Promise<unknown> {
  if (
    !response.ok ||
    String(response.type) === 'opaqueredirect' ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error('provider_status');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let json = '';
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('provider_limit');
    }
    json += decoder.decode(result.value, { stream: true });
  }
  return JSON.parse(json + decoder.decode());
}

export class MobileIssuesStopped extends Error {}

export async function checkMobileIssuesFence(context: ProcessorContext) {
  if (
    context.signal?.aborted ||
    context.now() >= context.deadline ||
    !(await context.fence())
  )
    throw new MobileIssuesStopped();
  if (context.signal?.aborted || context.now() >= context.deadline)
    throw new MobileIssuesStopped();
}

function sourceQuery(ios: string, android: string) {
  const read = (table: string, platform: Platform) => `
    SELECT '${platform}' AS platform, issue_id, event_id, event_timestamp,
           SAFE_CAST(application.build_version AS INT64) AS build
    FROM \`${table}\`
    WHERE event_timestamp >= TIMESTAMP_SUB(@slot, INTERVAL 7 DAY)
      AND event_timestamp < @slot
      AND REGEXP_CONTAINS(issue_id, r'^[a-f0-9]{32}$')
  `;
  return `
    WITH events AS (${read(ios, 'ios')} UNION ALL ${read(android, 'android')}),
    counts AS (
      SELECT platform, issue_id,
        MAX(IF(event_timestamp >= TIMESTAMP_SUB(@slot, INTERVAL 30 MINUTE), build, NULL)) AS build,
        MIN(event_timestamp) AS first_at,
        COUNT(DISTINCT IF(event_timestamp >= TIMESTAMP_SUB(@slot, INTERVAL 30 MINUTE), event_id, NULL)) AS recent,
        COUNT(DISTINCT IF(event_timestamp >= TIMESTAMP_SUB(@slot, INTERVAL 3 HOUR)
          AND event_timestamp < TIMESTAMP_SUB(@slot, INTERVAL 30 MINUTE), event_id, NULL)) AS previous
      FROM events WHERE build BETWEEN 1 AND 2147483647
      GROUP BY platform, issue_id HAVING recent > 0
    )
    SELECT platform, issue_id, build, UNIX_MILLIS(first_at), recent, previous
    FROM counts
    WHERE first_at >= TIMESTAMP_SUB(@slot, INTERVAL 30 MINUTE)
       OR (recent >= 10 AND recent * 5 >= 3 * GREATEST(previous, 1))
       OR EXISTS (
         SELECT 1 FROM UNNEST(@fixed_builds) AS fix
         WHERE fix.issue_key = CONCAT(counts.platform, ':', counts.issue_id)
           AND counts.build >= fix.build
       )
    ORDER BY (recent >= 25 AND recent * 5 >= 3 * GREATEST(previous, 1)) DESC,
             recent DESC, platform, issue_id
    LIMIT ${MAX_ROWS}
  `;
}

function field(value: unknown) {
  if (!value || typeof value !== 'object' || !('v' in value))
    throw new Error('provider_shape');
  return value.v;
}

function integer(value: unknown, min: number) {
  if (typeof value !== 'string' || !/^\d{1,16}$/u.test(value))
    throw new Error('provider_shape');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min)
    throw new Error('provider_shape');
  return parsed;
}

function rows(value: unknown): IssueCounts[] {
  if (!value || typeof value !== 'object') throw new Error('provider_shape');
  const result = value as Record<string, unknown>;
  if (
    result.jobComplete !== true ||
    result.pageToken ||
    integer(result.totalRows, 0) > MAX_ROWS
  )
    throw new Error('provider_incomplete');
  const list = result.rows ?? [];
  if (!Array.isArray(list) || list.length !== Number(result.totalRows))
    throw new Error('provider_shape');
  return list.map((row: unknown) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('f' in row) ||
      !Array.isArray(row.f) ||
      row.f.length !== 6
    )
      throw new Error('provider_shape');
    const [platform, issueId, build, firstAt, recent, previous] =
      row.f.map(field);
    if (
      (platform !== 'ios' && platform !== 'android') ||
      typeof issueId !== 'string' ||
      !ISSUE_ID.test(issueId)
    )
      throw new Error('provider_shape');
    return {
      platform,
      issueId,
      build: integer(build, 1),
      firstAt: integer(firstAt, 1),
      recent: integer(recent, 1),
      previous: integer(previous, 0),
    };
  });
}

export async function queryMobileIssues(
  context: ProcessorContext,
  slot: string,
  credentials: string,
  fixes: ReadonlyMap<string, number>
) {
  const config = settings(credentials);
  const jwt = await assertion(
    config.client_email,
    config.private_key,
    context.now()
  );
  await checkMobileIssuesFence(context);
  const token = await cappedJson(
    await context.fetch(TOKEN_URL, {
      method: 'POST',
      redirect: 'manual',
      signal: context.signal,
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })
  );
  if (
    !token ||
    typeof token !== 'object' ||
    !('access_token' in token) ||
    typeof token.access_token !== 'string' ||
    !/^[A-Za-z0-9._-]{1,4096}$/u.test(token.access_token)
  )
    throw new Error('provider_shape');

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${config.project_id}/queries`;
  await checkMobileIssuesFence(context);
  return rows(
    await cappedJson(
      await context.fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: context.signal,
        headers: {
          authorization: `Bearer ${token.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: sourceQuery(config.ios_table, config.android_table),
          useLegacySql: false,
          location: config.location,
          maximumBytesBilled: '67108864',
          timeoutMs: 8000,
          jobTimeoutMs: '10000',
          maxResults: MAX_ROWS,
          parameterMode: 'NAMED',
          queryParameters: [
            {
              name: 'slot',
              parameterType: { type: 'TIMESTAMP' },
              parameterValue: {
                value: new Date(Date.parse(slot) - SOURCE_LAG_MS).toISOString(),
              },
            },
            {
              name: 'fixed_builds',
              parameterType: {
                type: 'ARRAY',
                arrayType: {
                  type: 'STRUCT',
                  structTypes: [
                    { name: 'issue_key', type: { type: 'STRING' } },
                    { name: 'build', type: { type: 'INT64' } },
                  ],
                },
              },
              parameterValue: {
                arrayValues: Array.from(fixes, ([issueKey, build]) => ({
                  structValues: {
                    issue_key: { value: issueKey },
                    build: { value: String(build) },
                  },
                })),
              },
            },
          ],
        }),
      })
    )
  );
}
