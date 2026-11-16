import {
  combineChunks,
  createServerClient,
  stringFromBase64URL,
} from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  isSupabaseAuthCookieNameForUrls,
  sanitizeSupabaseAuthCookies,
} from './auth-cookie-sanitizer';
import {
  checkEnvVariables,
  getSupabaseAuthCookieUrls,
  getSupabaseCookieOptions,
  type SupabaseCookie,
} from './common';
import { sessionUserAgentHeaders } from './session-user-agent';

const outgoingSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().optional(),
  user: z.object({ id: z.string().min(1) }),
});

export async function createAccountSwitchAuth(
  request: Request,
  transport: typeof globalThis.fetch = globalThis.fetch
) {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const { url, key } = checkEnvVariables({ useSecretKey: false });
  const cookieOptions = getSupabaseCookieOptions(url, request.url);
  const initial = cookieStore.getAll();
  const incoming = sanitizeSupabaseAuthCookies(
    initial,
    getSupabaseAuthCookieUrls(url)
  );
  let refreshUsed = false;
  const boundedFetch: typeof globalThis.fetch = async (input, init) => {
    const target = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (
      target.pathname.endsWith('/token') &&
      target.searchParams.get('grant_type') === 'refresh_token'
    ) {
      if (refreshUsed)
        return new Response(
          '{"error":"refresh_denied","error_description":"Session unavailable"}',
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      refreshUsed = true;
    }
    return transport(input, init);
  };
  const global = {
    fetch: boundedFetch,
    headers: sessionUserAgentHeaders(request.headers),
  };
  const detached = createClient(url, key, {
    global,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return {
    async readOutgoing() {
      // Read the SSR wire format directly: getSession may refresh before admission.
      try {
        const raw = await combineChunks(
          cookieOptions.name ?? '',
          async (name) => incoming.find((c) => c.name === name)?.value ?? null
        );
        if (!raw) return null;
        const parsed = outgoingSchema.safeParse(
          JSON.parse(
            raw.startsWith('base64-') ? stringFromBase64URL(raw.slice(7)) : raw
          )
        );
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    refreshTarget(tokens: { access_token: string; refresh_token: string }) {
      return detached.auth.setSession(tokens);
    },
    async commit(session: Session) {
      const pending: SupabaseCookie[] = initial
        .filter((c) =>
          isSupabaseAuthCookieNameForUrls(
            c.name,
            getSupabaseAuthCookieUrls(url)
          )
        )
        .flatMap((c) => [
          { name: c.name, value: '', options: { ...cookieOptions, maxAge: 0 } },
          ...(cookieOptions.domain
            ? [
                {
                  name: c.name,
                  value: '',
                  options: { ...cookieOptions, domain: undefined, maxAge: 0 },
                },
              ]
            : []),
        ]);
      const installer = createServerClient(url, key, {
        global,
        cookieOptions,
        cookies: {
          getAll: () => [],
          setAll: (values) => {
            pending.push(...values);
          },
        },
      });
      const { data, error } = await installer.auth.setSession(session);
      if (error || data.session?.user.id !== session.user.id)
        throw new Error('Session unavailable');
      for (const { name, value, options } of pending)
        cookieStore.set(name, value, options);
    },
  };
}

export async function clearAccountSwitchSession(request: Request) {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const { url } = checkEnvVariables({ useSecretKey: false });
  const options = getSupabaseCookieOptions(url, request.url);
  for (const cookie of store.getAll()) {
    if (
      !isSupabaseAuthCookieNameForUrls(
        cookie.name,
        getSupabaseAuthCookieUrls(url)
      )
    )
      continue;
    store.set(cookie.name, '', { ...options, maxAge: 0 });
    if (options.domain)
      store.set(cookie.name, '', { ...options, domain: undefined, maxAge: 0 });
  }
}
