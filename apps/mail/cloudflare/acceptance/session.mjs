// Supabase password sign-in and the cookie shape the Mail proxy reads.
// The sign-in is a real call to the configured Supabase project; only the
// Web login page and its verify-token redirect are not exercised.
const CHUNK_SIZE = 3180;

export function storageKey(supabaseUrl) {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export async function passwordSignIn({
  supabaseUrl,
  publishableKey,
  email,
  password,
}) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );
  // The error body can echo account details, so only the status is reported.
  if (!response.ok)
    throw new Error(`Supabase password sign-in failed: ${response.status}`);
  const session = await response.json();
  if (!session.access_token || !session.refresh_token)
    throw new Error('Supabase sign-in returned no session');
  return session;
}

/** `@supabase/ssr` layout: `base64-` + base64url JSON, chunked as `.0`, `.1`. */
export function sessionCookies(supabaseUrl, session) {
  const key = storageKey(supabaseUrl);
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  if (value.length <= CHUNK_SIZE) return [[key, value]];
  const chunks = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_SIZE)
    chunks.push([
      `${key}.${chunks.length}`,
      value.slice(offset, offset + CHUNK_SIZE),
    ]);
  return chunks;
}

export class CookieJar {
  #cookies = new Map();

  set(name, value) {
    this.#cookies.set(name, value);
  }

  /** Applies `Set-Cookie` headers, honouring expiry-by-clearing. */
  absorb(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const index = pair.indexOf('=');
      if (index < 1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((attribute) =>
        /^\s*max-age=0\s*$/iu.test(attribute)
      );
      if (!value || expired) this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  header() {
    return [...this.#cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  names() {
    return [...this.#cookies.keys()].sort();
  }
}
