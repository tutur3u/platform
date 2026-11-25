'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONDITIONAL_SKIP = /\.(?:skipIf|runIf)\s*\(/;
const ALLOW_ENV = 'CHECK_CHANGED_ALLOW_SKIPPED_SUITES';

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function declaresConditionalSkip(file) {
  try {
    return CONDITIONAL_SKIP.test(stripComments(fs.readFileSync(file, 'utf8')));
  } catch {
    return false;
  }
}

function listedInEnv(file, env, cwd, root) {
  return String(env?.[ALLOW_ENV] ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((entry) =>
      [cwd, root].some(
        (base) => base && path.resolve(base, entry) === path.resolve(file)
      )
    );
}

// An entirely skipped suite (every collected test skipped, none failed) may
// stand in for a passing test only when the file opts in to conditional
// skipping, or when it is listed in CHECK_CHANGED_ALLOW_SKIPPED_SUITES. Zero
// collected tests, collection errors and failed tests never qualify.
function acceptedAsSkipped(module, file, { env, cwd, root }) {
  return (
    module.ok === true &&
    module.state === 'skipped' &&
    module.total > 0 &&
    module.skipped === module.total &&
    module.failed === 0 &&
    module.passed === 0 &&
    (declaresConditionalSkip(file) || listedInEnv(file, env, cwd, root))
  );
}

function validModule(module) {
  return (
    module?.ok === true &&
    typeof module.id === 'string' &&
    ['total', 'passed', 'failed', 'skipped'].every((key) =>
      Number.isInteger(module[key])
    )
  );
}

function prepareVitestResult(cwd, explicitTests = [], options = {}) {
  const env = options.env ?? process.env;
  const root = options.root;
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'check-changed-vitest-')
  );
  const file = path.join(directory, 'result.json');
  return {
    args: [
      '--reporter=default',
      '--reporter',
      path.join(__dirname, 'vitest-reporter.mjs'),
    ],
    env: { CHECK_CHANGED_VITEST_RESULT: file },
    error() {
      let report;
      try {
        report = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return 'Vitest did not produce a readable result';
      }
      if (
        report?.reason !== 'passed' ||
        report.unhandledErrors !== 0 ||
        !Array.isArray(report.modules) ||
        !report.modules.every(validModule)
      ) {
        return 'Vitest reported a collection, execution, or configuration failure';
      }
      const byFile = new Map(
        report.modules.map((module) => [path.resolve(cwd, module.id), module])
      );
      const missing = explicitTests.filter((test) => {
        const testFile = path.resolve(cwd, test);
        const module = byFile.get(testFile);
        if (!module) return true;
        if (module.passed > 0) return false;
        return !acceptedAsSkipped(module, testFile, { env, cwd, root });
      });
      return missing.length
        ? `Vitest reported no passing tests in: ${missing.join(', ')}`
        : null;
    },
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

module.exports = { ALLOW_ENV, prepareVitestResult };
