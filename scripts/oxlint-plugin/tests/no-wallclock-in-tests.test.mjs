import { RuleTester } from 'oxlint/plugins-dev';
import rule from '../rules/no-wallclock-in-tests.mjs';

const tester = new RuleTester();

tester.run('no-wallclock-in-tests', rule, {
  valid: [
    // Outside test files the rule is inert.
    {
      code: 'Date.now(); new Date(); setTimeout(fn, 1000);',
      filename: 'src/util.ts',
    },
    { code: 'const t = Date.now();', filename: 'app.js' },
    // Deterministic dates are fine, even in tests.
    {
      code: "const d = new Date('2026-01-01T00:00:00Z');",
      filename: 'foo.test.ts',
    },
    { code: 'const d = new Date(0);', filename: 'foo.spec.ts' },
    { code: 'const t = Date.parse("2026-01-01");', filename: 'foo.test.ts' },
    // The recommended fake-timer pattern must not self-report.
    { code: 'vi.setSystemTime(new Date(0));', filename: 'foo.test.ts' },
  ],
  invalid: [
    {
      code: 'Date.now();',
      filename: 'foo.test.ts',
      errors: [{ messageId: 'dateNow' }],
    },
    {
      code: 'const d = new Date();',
      filename: 'foo.spec.ts',
      errors: [{ messageId: 'newDate' }],
    },
    {
      code: 'setTimeout(() => {}, 1000);',
      filename: 'foo.test.ts',
      errors: [{ messageId: 'timer' }],
    },
    {
      code: 'setInterval(() => {}, 50);',
      filename: 'foo.test.ts',
      errors: [{ messageId: 'timer' }],
    },
    {
      code: 'Date.now(); new Date();',
      filename: 'foo.test.ts',
      errors: [{ messageId: 'dateNow' }, { messageId: 'newDate' }],
    },
  ],
});
