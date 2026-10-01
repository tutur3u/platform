import type { Page, TestInfo } from '@playwright/test';

/** Passive observers only: no breakpoints, lazy resolution, or element changes. */
export async function captureStorefrontSlotDiagnostics(
  page: Page,
  testInfo: TestInfo
) {
  await page.addInitScript(() => {
    const observed: unknown[] = [];
    const shape = (value: unknown): Record<string, unknown> => {
      if (value == null) return { kind: String(value) };
      const result: Record<string, unknown> = {
        kind: typeof value,
        array: Array.isArray(value),
      };
      if (typeof value !== 'object') return result;
      const element = value as Record<string, unknown>;
      result.reactType =
        typeof element.$$typeof === 'symbol'
          ? String(element.$$typeof)
          : typeof element.$$typeof;
      result.elementType = typeof element.type;
      result.payloadKind = typeof element._payload;
      if (Array.isArray(value)) result.length = value.length;
      if (element._payload && typeof element._payload === 'object') {
        const payload = element._payload as Record<string, unknown>;
        const status = payload.status ?? payload._status;
        if (
          typeof status === 'number' ||
          ['pending', 'fulfilled', 'rejected', 'blocked'].includes(
            String(status)
          )
        )
          result.payloadStatus = status;
        result.payloadThen = typeof payload.then;
      }
      return result;
    };
    type Fiber = {
      type?: { name?: string; displayName?: string };
      memoizedProps?: { asChild?: boolean; children?: unknown };
      pendingProps?: { asChild?: boolean; children?: unknown };
      child?: Fiber;
      sibling?: Fiber;
    };
    const record = (fiber: Fiber, phase: string) => {
      if (fiber.type?.name !== 'Button' && fiber.type?.displayName !== 'Button')
        return;
      const props = fiber.memoizedProps ?? fiber.pendingProps;
      if (!props?.asChild) return;
      // Ring buffer contains only structural types/status, never props/text or
      // a thenable's value/reason. Do not call _init, then(), or React.use().
      observed.push({ phase, child: shape(props.children) });
      if (observed.length > 24) observed.shift();
    };
    const inspect = (root: { current?: Fiber }) => {
      const stack = root.current ? [root.current] : [];
      let remaining = 500;
      while (stack.length && remaining-- > 0) {
        const fiber = stack.pop()!;
        record(fiber, 'commit');
        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
      }
    };
    const target = window as unknown as Record<string, unknown>;
    const existing = target.__REACT_DEVTOOLS_GLOBAL_HOOK__ as
      | Record<string, unknown>
      | undefined;
    let rendererId = 0;
    const hook = existing ?? {
      supportsFiber: true,
      inject: () => ++rendererId,
    };
    const wrap = (name: string, observe: (...args: unknown[]) => void) => {
      const original = hook[name];
      hook[name] = (...args: unknown[]) => {
        // Diagnostics must not change React's existing DevTools callbacks.
        try {
          observe(...args);
        } catch {}
        return typeof original === 'function'
          ? Reflect.apply(original, hook, args)
          : undefined;
      };
    };
    wrap('onCommitFiberRoot', (_id, root) =>
      inspect(root as { current?: Fiber })
    );
    wrap('onCommitFiberUnmount', (_id, fiber) =>
      record(fiber as Fiber, 'unmount')
    );
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    target.__storefrontSlotShapes = observed;
  });

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
      const childShapes = await page.evaluate(
        () =>
          (window as unknown as Record<string, unknown>)
            .__storefrontSlotShapes ?? []
      );
      await testInfo.attach('storefront-slot-boundary-diagnostics', {
        body: Buffer.from(JSON.stringify({ sources, childShapes }, null, 2)),
        contentType: 'application/json',
      });
    } finally {
      await session.detach().catch(() => undefined);
    }
  };
}
