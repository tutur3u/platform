'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inResourceLane } = require('../trusted-ttr.js');
const { prepareVitestResult } = require('./vitest-result.js');
const { pinVitestTsconfig } = require('./vitest-tsconfig-pin.js');

function runCommand(step, context) {
  if (step.requiresAdmission && !context.ttr && !inResourceLane(context.env)) {
    return { status: 'fail', detail: 'Run with ttr resources admission.' };
  }
  if (step.prerequisite) {
    const result = runCommand(step.prerequisite, context);
    if (result.status !== 'pass') {
      const reason = result.detail ? ` (${result.detail})` : '';
      return {
        ...result,
        status: 'fail',
        detail: `${step.prerequisite.label} failed${reason}`,
      };
    }
  }
  const prefix = step.heavy && context.ttr ? context.ttr : [];
  const pin = (context.pinVitestTsconfig ?? pinVitestTsconfig)(
    step,
    context.root
  );
  let temporaryCwd;
  let report;
  try {
    if (step.temporaryCwd) {
      temporaryCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'check-changed-'));
    }
    const cwd = temporaryCwd ?? path.join(context.root, step.cwd ?? '');
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
    if (temporaryCwd) fs.rmSync(temporaryCwd, { recursive: true, force: true });
  }
}

module.exports = { runCommand };
