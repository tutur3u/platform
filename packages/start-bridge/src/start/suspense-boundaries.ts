/**
 * Finds streamed React SSR placeholders that a complete HTML response leaves
 * unresolved. Each pending boundary (`<template id="B:x">`) needs a completion
 * (`$RC`/`$RR`) whose content segment was emitted, and each postponed segment
 * (`<template id="P:x">`) needs its `$RS`. A boundary left pending, or switched
 * to client rendering (`$RX`), hydrates as React error #419.
 */
export function findUnresolvedSuspenseBoundaries(html: string): string[] {
  const emitted = new Set(
    [...html.matchAll(/<div hidden id="(S:[0-9a-f]+)"/gu)].map(([, id]) => id)
  );
  const completed = new Set(
    [...html.matchAll(/\$R[CR]\("(B:[0-9a-f]+)","(S:[0-9a-f]+)"/gu)]
      .filter(([, , segment]) => segment && emitted.has(segment))
      .map(([, boundary]) => boundary)
  );
  const clientRendered = new Set(
    [...html.matchAll(/\$RX\("(B:[0-9a-f]+)"/gu)].map(([, id]) => id)
  );
  const filled = new Set(
    [...html.matchAll(/\$RS\("S:[0-9a-f]+","(P:[0-9a-f]+)"\)/gu)].map(
      ([, id]) => id
    )
  );

  return [...html.matchAll(/<template id="([BP]:[0-9a-f]+)"/gu)]
    .map(([, id]) => id as string)
    .filter((id) =>
      id.startsWith('B:')
        ? !completed.has(id) || clientRendered.has(id)
        : !filled.has(id)
    );
}
