'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareVitestResult } = require('./vitest-result.js');
const { pinVitestTsconfig } = require('./vitest-tsconfig-pin.js');

function runCommand(step, context) {
  const missing = step.requiredFiles?.filter(
    (file) =>
      !fs
        .statSync(path.join(context.root, file), { throwIfNoEntry: false })
        ?.isFile()
  );
  if (missing?.length) {
    const detail = `missing workspace build artifacts: ${missing.join(', ')}`;
    return {
      status: 'fail',
      detail: step.missingFilesHint
        ? `${detail}. ${step.missingFilesHint}`
        : detail,
    };
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
