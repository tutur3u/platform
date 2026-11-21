// Workers cannot launch a browser. The Zalo web sync loads Playwright through a
// guarded dynamic import and reports zalo_personal_web_sync_browser_unavailable
// when it fails, so the Worker build resolves the module to this failing stub.
throw new Error('playwright is unavailable on Cloudflare Workers');
