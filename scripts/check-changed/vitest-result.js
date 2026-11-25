'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function prepareVitestResult(cwd, explicitTests = []) {
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
        !report.modules.every(
          (module) =>
            module?.ok === true &&
            typeof module.id === 'string' &&
            typeof module.passed === 'boolean'
        )
      ) {
        return 'Vitest reported a collection, execution, or configuration failure';
      }
      const passingFiles = new Set(
        report.modules
          .filter((module) => module.passed)
          .map((module) => path.resolve(cwd, module.id))
      );
      const missing = explicitTests.filter(
        (test) => !passingFiles.has(path.resolve(cwd, test))
      );
      return missing.length
        ? `Vitest reported no passing tests in: ${missing.join(', ')}`
        : null;
    },
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

module.exports = { prepareVitestResult };
