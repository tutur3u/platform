#!/usr/bin/env node
// Usage: node scripts/native-cutover/smoke.mjs --origin https://tasks.tuturuuu.com \
//          --app tasks --expect native|legacy [--json]
// Read-only except one non-JSON POST to the server-function base (native),
// which the Worker rejects with 415 before any app code runs.
import { parseArgs } from 'node:util';
import { runSmoke } from './smoke-checks.mjs';

const { values } = parseArgs({
  options: {
    origin: { type: 'string' },
    app: { type: 'string' },
    expect: { type: 'string', default: 'native' },
    json: { type: 'boolean', default: false },
  },
});
if (
  !values.origin ||
  !values.app ||
  !['native', 'legacy'].includes(values.expect)
) {
  console.error(
    'Usage: smoke.mjs --origin <https://app.host> --app <id> --expect native|legacy'
  );
  process.exit(2);
}
const report = await runSmoke({
  origin: values.origin.replace(/\/+$/u, ''),
  app: values.app,
  expectRuntime: values.expect,
});
if (values.json) console.log(JSON.stringify(report, null, 2));
else
  for (const result of report.results)
    console.log(
      `${result.ok ? 'ok  ' : 'FAIL'} ${result.name} (${result.status ?? '-'}, ${result.ttfbMs ?? '-'} ms)${result.failures.length ? `\n     ${result.failures.join('\n     ')}` : ''}`
    );
process.exit(report.ok ? 0 : 1);
