import { writeFileSync } from 'node:fs';

export default class CheckChangedReporter {
  onTestRunEnd(modules, unhandledErrors, reason) {
    writeFileSync(
      process.env.CHECK_CHANGED_VITEST_RESULT,
      JSON.stringify({
        reason,
        unhandledErrors: unhandledErrors.length,
        modules: modules.map((module) => ({
          id: module.moduleId,
          ok: module.ok(),
          passed: !module.children.allTests('passed').next().done,
        })),
      })
    );
  }
}
