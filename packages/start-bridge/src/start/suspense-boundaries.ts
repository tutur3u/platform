// React's ids, optionally under a render's `identifierPrefix` (e.g. `rB:0`).
const id = (kind: 'B' | 'P' | 'S') => `([^"<>]*${kind}:[0-9a-f]+)`;

/**
 * Finds streamed React SSR placeholders that a complete HTML response leaves
 * unresolved. A pending boundary (`<!--$?--><template id="B:x">`) needs a
 * completion whose content segment was emitted; a postponed segment
 * (`<template id="P:x">`) needs its fill; a boundary switched to client
 * rendering (`$RX`, or `<!--$!-->` from the shell) is reported too. Each hydrates
 * as a React recoverable error such as #419.
 *
 * Reads both instruction forms React emits: inline scripts (`$RC`, `$RR`,
 * `$RS`, `$RX`) and the external-runtime `<template data-r*i>` attributes.
 */
export function findUnresolvedSuspenseBoundaries(html: string): string[] {
  const ids = (pattern: string, group = 1) =>
    [...html.matchAll(new RegExp(pattern, 'gu'))].map((match) => match[group]);
  const emitted = new Set(
    // Segment containers: <div hidden>, hidden <svg>/<math>, and <table hidden>
    // or its <tbody>/<tr>/<colgroup> in table contexts.
    ids(`<(?:div|svg|math|table|tbody|tr|colgroup)\\s[^>]*?\\bid="${id('S')}"`)
  );
  const completions = [
    ...html.matchAll(
      new RegExp(
        `\\$R[CR]\\("${id('B')}","${id('S')}"|<template data-r[cr]i="" data-bid="${id('B')}" data-sid="${id('S')}"`,
        'gu'
      )
    ),
  ];
  const completed = new Set(
    completions
      .filter(([, , inline, , attribute]) => emitted.has(inline ?? attribute))
      .map(([, inline, , attribute]) => inline ?? attribute)
  );
  const clientRendered = new Set([
    ...ids(`\\$RX\\("${id('B')}"`),
    ...ids(`<template data-rxi="" data-bid="${id('B')}"`),
  ]);
  const fills = [
    ...html.matchAll(
      new RegExp(
        `\\$RS\\("${id('S')}","${id('P')}"\\)|<template data-rsi="" data-sid="${id('S')}" data-pid="${id('P')}"`,
        'gu'
      )
    ),
  ];
  const filled = new Set(
    fills
      .filter(([, inline, , attribute]) => emitted.has(inline ?? attribute))
      .map(([, , inline, , attribute]) => inline ?? attribute)
  );

  const pending = [
    ...html.matchAll(
      new RegExp(
        `<!--\\$\\?--><template id="${id('B')}"></template>|<template id="${id('P')}"></template>`,
        'gu'
      )
    ),
  ].flatMap(([, boundary, placeholder]) =>
    boundary
      ? !completed.has(boundary) || clientRendered.has(boundary)
        ? [boundary]
        : []
      : placeholder && !filled.has(placeholder)
        ? [placeholder]
        : []
  );
  const shellClientRendered = [...html.matchAll(/<!--\$!-->/gu)].map(
    (_, index) => `<!--$!-->#${index}`
  );
  return [...pending, ...shellClientRendered];
}
