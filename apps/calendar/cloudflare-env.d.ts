/// <reference types="@cloudflare/workers-types" />
interface CloudflareEnv {
  ASSETS: Fetcher;
  ABUSE_GUARD: Service;
  ABUSE_GUARD_FAMILIES: 'proxy';
}
