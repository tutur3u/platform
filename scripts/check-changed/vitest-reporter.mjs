import { writeFileSync } from 'node:fs';

function count(module, state) {
  let total = 0;
  for (const _test of module.children.allTests(state)) total += 1;
  return total;
}

export default class CheckChangedReporter {
  onTestRunEnd(modules, unhandledErrors, reason) {
    const file = process.env.CHECK_CHANGED_VITEST_RESULT;
    if (!file) {
      throw new Error(
        'CHECK_CHANGED_VITEST_RESULT is not set; the check:changed Vitest reporter must be run by scripts/check-changed.js'
      );
    }
    writeFileSync(
      file,
      JSON.stringify({
        reason,
        unhandledErrors: unhandledErrors.length,
        modules: modules.map((module) => ({
          id: module.moduleId,
          ok: module.ok(),
          state: module.state(),
          total: count(module),
          passed: count(module, 'passed'),
          failed: count(module, 'failed'),
          skipped: count(module, 'skipped'),
        })),
      })
    );
  }
}
