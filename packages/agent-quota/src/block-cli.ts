import { createBlock, writeBlock } from './block-ledger';
import { HookError } from './hook-ledger';
export async function runBlock(args: string[]) {
  try {
    const allowed = new Set([
      '--pool',
      '--model-scope',
      '--reason',
      '--evidence',
      '--observed-at',
      '--reset-at',
      '--next-eligible-at',
      '--timezone',
    ]);
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index];
      const value = args[index + 1];
      if (
        !name ||
        !allowed.has(name) ||
        seen.has(name) ||
        !value ||
        value.startsWith('--')
      )
        throw new HookError('block-arguments-invalid');
      seen.add(name);
    }
    const get = (name: string) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    };
    const pool = get('--pool'),
      modelScope = get('--model-scope'),
      reason = get('--reason'),
      evidence = get('--evidence');
    if (!pool || !modelScope || !reason || !evidence)
      throw new HookError('block-required-arguments-missing');
    if (get('--reset-at') && get('--next-eligible-at'))
      throw new HookError('block-expiry-options-conflict');
    const block = createBlock({
      pool,
      modelScope,
      reason,
      evidence,
      observedAt: get('--observed-at') ?? new Date().toISOString(),
      resetAt: get('--reset-at'),
      nextEligibleAt: get('--next-eligible-at'),
      timezone:
        get('--timezone') ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    console.log(JSON.stringify(await writeBlock(block)));
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reasons: [
          error instanceof HookError ? error.message : 'block-write-failed',
        ],
      })
    );
    process.exitCode = 2;
  }
}
