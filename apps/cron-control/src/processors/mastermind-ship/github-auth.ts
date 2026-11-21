import {
  type RequestBudget,
  type ShipFetchDeps,
  ShipSourceError,
  shipFetch,
} from './http';

// GitHub credentials for the ship collector, preferred first:
// 1. A GitHub App (MASTERMIND_SHIP_GITHUB_APP_ID and a PKCS#8 PEM in
//    MASTERMIND_SHIP_GITHUB_APP_PRIVATE_KEY) installed on each tracked owner
//    with read-only Deployments, Actions, Checks, Commit statuses, Contents
//    and Metadata. Each run mints a one-hour installation token per owner;
//    installation ids are cached in the collector state.
// 2. MASTERMIND_SHIP_GITHUB_TOKEN, one read-only token for every owner.
// The shared fleet token is never used.

export interface GithubAuthEnv {
  MASTERMIND_SHIP_GITHUB_APP_ID?: string;
  MASTERMIND_SHIP_GITHUB_APP_PRIVATE_KEY?: string;
  MASTERMIND_SHIP_GITHUB_TOKEN?: string;
}

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

export function githubConfigured(env: GithubAuthEnv) {
  return appCredentials(env) !== null || tokenCredential(env) !== null;
}

function appCredentials(env: GithubAuthEnv) {
  const id = env.MASTERMIND_SHIP_GITHUB_APP_ID?.trim();
  const key = env.MASTERMIND_SHIP_GITHUB_APP_PRIVATE_KEY?.trim();
  if (!id || !/^\d{1,12}$/u.test(id) || !key?.includes('BEGIN PRIVATE KEY'))
    return null;
  return { id, key };
}

function tokenCredential(env: GithubAuthEnv) {
  const token = env.MASTERMIND_SHIP_GITHUB_TOKEN?.trim();
  return token && token.length >= 20 && !/\s/u.test(token) ? token : null;
}

function base64url(bytes: Uint8Array | string) {
  const binary =
    typeof bytes === 'string'
      ? bytes
      : Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary)
    .replace(/=+$/u, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

/** A ten-minute App JWT (RS256), backdated a minute for clock skew. */
export async function appJwt(appId: string, pem: string, now: number) {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, '')),
    (char) => char.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const seconds = Math.floor(now / 1000);
  const body = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: appId })
  )}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(body)
  );
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

/**
 * The bearer for one owner's reads. `installations` is updated in place when
 * an installation id is discovered. Throws `ShipSourceError('not-configured')`
 * without credentials.
 */
export async function githubBearer(
  env: GithubAuthEnv,
  deps: ShipFetchDeps,
  budget: RequestBudget,
  owner: string,
  repository: string,
  installations: Record<string, number>
): Promise<string> {
  const app = appCredentials(env);
  if (!app) {
    const token = tokenCredential(env);
    if (!token) throw new ShipSourceError('not-configured');
    return token;
  }
  let jwt: string;
  try {
    jwt = await appJwt(app.id, app.key, deps.now());
  } catch {
    throw new ShipSourceError('auth');
  }
  const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${jwt}` };
  let installation = installations[owner];
  if (!installation) {
    const found = await shipFetch(
      deps,
      budget,
      new URL(`/repos/${repository}/installation`, GITHUB_API),
      { method: 'GET', headers }
    );
    const id =
      found.status === 200 &&
      found.json &&
      typeof found.json === 'object' &&
      'id' in found.json
        ? found.json.id
        : null;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
      throw new ShipSourceError('invalid');
    installation = id;
    installations[owner] = id;
  }
  const minted = await shipFetch(
    deps,
    budget,
    new URL(`/app/installations/${installation}/access_tokens`, GITHUB_API),
    { method: 'POST', headers, body: '{}' }
  ).catch((error: unknown) => {
    // A removed installation is looked up again on the next run.
    delete installations[owner];
    throw error;
  });
  const token =
    minted.status === 200 &&
    minted.json &&
    typeof minted.json === 'object' &&
    'token' in minted.json
      ? minted.json.token
      : null;
  if (typeof token !== 'string' || token.length < 20)
    throw new ShipSourceError('invalid');
  return token;
}
