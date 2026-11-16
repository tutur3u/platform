import { pathToFileURL } from 'node:url';
import {
  parseArgs,
  receiptStore,
} from '../../../scripts/auth-ops/fleet-qa.mjs';
export { parseArgs };
export async function main(args) {
  const { custody, receipt, command, rest } = parseArgs(args);
  if (['execution', 'cleanup'].includes(command))
    throw new Error('DIRECT_HELPER_REQUIRED');
  const store = await receiptStore(receipt, { custody });
  try {
    const r = await store.read();
    if (command === 'record-workspace') {
      if (r.sharedRecords.length) throw new Error('ALREADY_RECORDED');
      r.sharedRecords.push({ label: rest[0], id: rest[1], name: 'QA D241' });
      await store.save(r);
    } else if (command === 'record-visit') {
      r.visitedSurfaces.push({
        label: rest[0],
        surface: rest[1],
        at: new Date().toISOString(),
      });
      await store.save(r);
    }
    process.stdout.write(`${JSON.stringify(r)}\n`);
  } finally {
    await store.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      'STOP: preserve receipt for reviewed reconciliation.\n'
    );
    process.exitCode = 1;
  });
}
