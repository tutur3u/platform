import type { Page, TestInfo } from '@playwright/test';

// Only structural metadata: never serialize element props, thenable values,
// network headers, cookies, or API bodies from the synthetic fixture.
const childShapeExpression = `(() => {
  const shape = (value) => {
    if (value == null) return { kind: String(value) };
    const result = { kind: typeof value, array: Array.isArray(value) };
    if (typeof value !== 'object') return result;
    result.reactType = typeof value.$$typeof === 'symbol'
      ? String(value.$$typeof) : typeof value.$$typeof;
    result.elementType = typeof value.type;
    result.payloadKind = typeof value._payload;
    const payload = value._payload;
    if (payload && typeof payload === 'object') {
      const status = payload.status ?? payload._status;
      if (typeof status === 'number' ||
          ['pending', 'fulfilled', 'rejected', 'blocked'].includes(status))
        result.payloadStatus = status;
      result.payloadThen = typeof payload.then;
    }
    if (Array.isArray(value)) result.length = value.length;
    return result;
  };
  return {
    children: shape(typeof children === 'undefined' ? undefined : children),
    childArray: shape(typeof childrenArray === 'undefined' ? undefined : childrenArray),
    child: shape(typeof child === 'undefined' ? undefined : child),
    reactUse: typeof use,
    reactNamespaceUse: typeof React === 'undefined' ? 'unbound' : typeof React.use,
  };
})()`;

export async function captureStorefrontSlotDiagnostics(
  page: Page,
  testInfo: TestInfo
) {
  const session = await page.context().newCDPSession(page);
  const captures: unknown[] = [];
  const pending = new Set<Promise<void>>();
  let stopped = false;

  session.on('Debugger.paused', (event) => {
    const task = (async () => {
      try {
        const description = event.data?.description ?? '';
        if (
          stopped ||
          captures.length >= 3 ||
          !description.includes('Slot failed to slot onto its children')
        )
          return;
        const frame = event.callFrames.find((candidate) =>
          candidate.functionName.includes('Slot')
        );
        if (!frame) return;
        const { scriptSource } = await session.send(
          'Debugger.getScriptSource',
          {
            scriptId: frame.location.scriptId,
          }
        );
        const lines = scriptSource.split('\n');
        const throwLine = frame.location.lineNumber;
        const start = Math.max(0, throwLine - 80);
        const source = lines
          .slice(start, throwLine + 20)
          .join('\n')
          .slice(0, 20_000);
        const localScope = frame.scopeChain.find(
          (scope) => scope.type === 'local'
        );
        const locals = localScope?.object.objectId
          ? await session.send('Runtime.getProperties', {
              objectId: localScope.object.objectId,
              ownProperties: true,
            })
          : null;
        const childNames = (locals?.result ?? [])
          .map((binding) => binding.name)
          .filter((name) => /^(children|childrenArray|child)\d*$/.test(name))
          .slice(0, 6);
        const expression = childNames.length
          ? childShapeExpression.replace(
              /children: shape\([\s\S]*?reactUse: typeof use,/,
              `${childNames.map((name) => `${name}: shape(${name})`).join(',')}, reactUse: typeof use,`
            )
          : childShapeExpression;
        const child = await session.send('Debugger.evaluateOnCallFrame', {
          callFrameId: frame.callFrameId,
          expression,
          returnByValue: true,
          silent: true,
        });
        captures.push({
          exception: 'Slot failed to slot onto its children',
          functionName: frame.functionName,
          line: throwLine + 1,
          sourceStartLine: start + 1,
          servedSourceExcerpt: source,
          structuralChildState: child.result.value ?? null,
          evaluationFailed: Boolean(child.exceptionDetails),
        });
      } catch {
        // Diagnostic failure must never replace the navigation assertion.
        captures.push({ diagnosticFailed: true });
      } finally {
        await session.send('Debugger.resume').catch(() => undefined);
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });

  await session.send('Debugger.enable');
  // React handles this exception with its boundary, so 'uncaught' misses it.
  await session.send('Debugger.setPauseOnExceptions', { state: 'all' });

  return async () => {
    stopped = true;
    await session
      .send('Debugger.setPauseOnExceptions', { state: 'none' })
      .catch(() => undefined);
    await Promise.allSettled([...pending]);
    await session.detach().catch(() => undefined);
    await testInfo.attach('storefront-slot-boundary-diagnostics', {
      body: Buffer.from(JSON.stringify({ captures }, null, 2)),
      contentType: 'application/json',
    });
  };
}
