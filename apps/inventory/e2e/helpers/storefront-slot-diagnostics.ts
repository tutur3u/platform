import type { Page, TestInfo } from '@playwright/test';

/** Passive observers only: no breakpoints, lazy resolution, or element changes. */
export async function captureStorefrontSlotDiagnostics(
  page: Page,
  testInfo: TestInfo
) {
  const session = await page.context().newCDPSession(page);
  const scripts: Array<{ scriptId: string; url: string }> = [];
  session.on('Debugger.scriptParsed', (script) => {
    if (
      scripts.length < 100 &&
      script.url.startsWith('http://localhost:7822/_next/static/chunks/')
    )
      scripts.push({ scriptId: script.scriptId, url: script.url });
  });
  await session.send('Debugger.enable');
  // Deliberately never setPauseOnExceptions or setBreakpoint: a pause can
  // resolve the pending RSC child and hide the failure under investigation.
  return async (failed: boolean) => {
    try {
      if (!failed) return;
      const sources: unknown[] = [];
      const candidates = [...scripts].sort(
        (a, b) =>
          Number(b.url.includes('node_modules')) -
          Number(a.url.includes('node_modules'))
      );
      for (const script of candidates.slice(0, 24)) {
        const { scriptSource } = await session.send(
          'Debugger.getScriptSource',
          {
            scriptId: script.scriptId,
          }
        );
        const index = scriptSource.indexOf('failed to slot onto its children');
        if (index < 0) continue;
        sources.push({
          chunk: new URL(script.url).pathname,
          servedSlotExcerpt: scriptSource.slice(
            Math.max(0, index - 12_000),
            index + 2_000
          ),
        });
        if (sources.length === 2) break;
      }
      await testInfo.attach('storefront-slot-boundary-diagnostics', {
        body: Buffer.from(
          JSON.stringify(
            {
              sources,
              childState:
                'Not captured: no React hook or render instrumentation',
            },
            null,
            2
          )
        ),
        contentType: 'application/json',
      });
    } finally {
      await session.detach().catch(() => undefined);
    }
  };
}
