export interface PasswordSession {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
  };
}

export interface BrowserCookieInput {
  domain: string;
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite: 'Lax';
  value: string;
}

export async function signInWithPassword({
  email,
  password,
  supabasePublishableKey,
  supabaseUrl,
}: {
  email: string;
  password: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
}): Promise<PasswordSession> {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: supabasePublishableKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );

  const payload = (await response.json()) as Partial<PasswordSession> & {
    error_description?: string;
    msg?: string;
  };

  if (!response.ok || !payload.access_token || !payload.user?.id) {
    throw new Error(
      `Password sign-in failed for ${email} (${response.status}): ${payload.error_description ?? payload.msg ?? 'unknown error'}`
    );
  }

  return payload as PasswordSession;
}

export function buildSupabaseBrowserCookies({
  mailUrl,
  session,
  supabaseUrl,
}: {
  mailUrl: string;
  session: PasswordSession;
  supabaseUrl: string;
}): BrowserCookieInput[] {
  const cookieName = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const domain = new URL(mailUrl).hostname;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks: string[] = [];

  for (let i = 0; i < encoded.length; i += 3180) {
    chunks.push(encoded.slice(i, i + 3180));
  }

  if (chunks.length === 1) {
    return [
      {
        name: cookieName,
        value: encoded,
        domain,
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ];
  }

  return chunks.map((chunk, index) => ({
    name: `${cookieName}.${index}`,
    value: chunk,
    domain,
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }));
}

export function cookiesToHeader(cookies: BrowserCookieInput[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function resolvePersonalMailboxId({
  cookies,
  mailUrl,
}: {
  cookies: BrowserCookieInput[];
  mailUrl: string;
}): Promise<string> {
  const response = await fetch(
    `${mailUrl}/api/v1/workspaces/personal/mail/bootstrap`,
    {
      headers: { cookie: cookiesToHeader(cookies) },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to bootstrap personal mailbox (${response.status}): ${(await response.text()).slice(0, 200)}`
    );
  }

  const body = (await response.json()) as {
    mailboxes?: Array<{ id: string; status?: string }>;
  };
  const active =
    body.mailboxes?.find((mailbox) => mailbox.status === 'active') ??
    body.mailboxes?.[0];

  if (!active?.id) {
    throw new Error('Bootstrap returned no active personal mailbox');
  }

  return active.id;
}
