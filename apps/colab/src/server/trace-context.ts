import type { Trace } from '@tuturuuu/multiplayer';

/** Keep complete read evidence, with an explicit re-read notice at the context cap. */
export function traceContext(trace: Trace[]) {
  const abbreviated = trace.map((entry) => ({
    ...entry,
    input: entry.input.slice(0, 300),
    output: `${entry.output.slice(0, 600)}\n[ABBREVIATED: read the record again before relying on omitted details.]`,
  }));
  let budget = 120_000 - JSON.stringify(abbreviated).length;
  for (let index = trace.length - 1; index >= 0; index--) {
    const entry = trace[index]!;
    if (!entry.tool.endsWith('.read') && index < trace.length - 6) continue;
    const extra =
      JSON.stringify(entry).length - JSON.stringify(abbreviated[index]).length;
    if (extra > budget) continue;
    abbreviated[index] = entry;
    budget -= extra;
  }
  return abbreviated;
}
