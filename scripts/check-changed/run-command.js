'use strict';

const path = require('node:path');
const { prepareVitestResult } = require('./vitest-result.js');
const { pinVitestTsconfig } = require('./vitest-tsconfig-pin.js');

function runCommand(step, context) {
  const prefix = step.heavy && context.ttr ? context.ttr : [];
  const pin = (context.pinVitestTsconfig ?? pinVitestTsconfig)(
    step,
    context.root
  );
  const cwd = path.join(context.root, step.cwd ?? '');
  let report;
  try {
    if (step.id.startsWith('vitest:')) {
      report = prepareVitestResult(cwd, step.explicitVitestTests, {
        env: context.env ?? process.env,
        root: context.root,
      });
    }
    const [command, ...args] = [
      ...prefix,
      step.command,
      ...pin.args,
      ...(report?.args ?? []),
    ];
    const result = context.spawn(command, args, {
      cwd,
      encoding: 'utf8',
      env: report
        ? { ...(context.env ?? process.env), ...report.env }
        : context.env,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) return { status: 'fail', detail: result.error.message };
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (result.status !== 0) {
      return { status: step.advisory ? 'advisory' : 'fail', output };
    }
    const detail = report?.error();
    return detail ? { status: 'fail', detail, output } : { status: 'pass' };
  } finally {
    report?.cleanup();
    pin.cleanup();
  }
}

module.exports = { runCommand };
