import { readFileSync } from 'node:fs';
import { collectChildren } from './collectors/children';
import { bool, id, object, timestamp } from './hook-input';
import { HookError } from './hook-ledger';
import { type DrainEvidence, reconcileChildren } from './reconcile-children';
export function runReconcile(args: string[]) {
  try {
    const parent = id(args[args.indexOf('--parent') + 1]);
    if (!args.includes('--parent')) throw new HookError('parent-required');
    const index = args.indexOf('--timezone');
    const timezone = index >= 0 ? args[index + 1] : undefined;
    if (timezone)
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    let drain: Record<string, DrainEvidence> = {};
    if (args.includes('--evidence-stdin')) {
      const input = object(JSON.parse(readFileSync(0, 'utf8')));
      drain = Object.fromEntries(
        Object.entries(input).map(([key, value]) => {
          const evidence = object(value);
          return [
            id(key),
            {
              observedAt: timestamp(evidence.observedAt),
              drained: bool(evidence.drained),
            },
          ];
        })
      );
    }
    console.log(
      JSON.stringify(
        reconcileChildren(
          collectChildren(parent),
          parent,
          new Date(),
          timezone,
          drain
        )
      )
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'block',
        reasons: [
          error instanceof HookError
            ? error.message
            : 'reconciliation-state-unavailable',
        ],
      })
    );
    process.exitCode = 1;
  }
}
