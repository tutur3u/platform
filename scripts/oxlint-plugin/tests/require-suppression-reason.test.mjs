import { RuleTester } from 'oxlint/plugins-dev';
import rule from '../rules/require-suppression-reason.mjs';

const tester = new RuleTester();

tester.run('require-suppression-reason', rule, {
  valid: [
    {
      code: '// eslint-disable-next-line no-console -- legacy API\nconsole.log("x");',
    },
    { code: '/* oxlint-disable no-unused-vars -- generated file */\nvar x;' },
    {
      code: '// oxlint-disable-next-line no-unused-vars -- placeholder never read\nconst a = 1;',
    },
    { code: '// just a normal comment\nconst a = 1;' },
    {
      code: '// TODO: add an eslint-disable here once we know why\nconst b = 2;',
    },
    { code: 'const s = "eslint-disable";\n' }, // not a comment
  ],
  invalid: [
    {
      code: '// oxlint-disable-next-line no-unused-vars --   \nconst value = 1;',
      errors: [{ messageId: 'missingReason' }],
    },
    {
      code: '// eslint-disable no-console\nconsole.log("x");',
      errors: [{ messageId: 'missingReason' }],
    },
    {
      code: '// oxlint-disable-next-line no-unused-vars\nconst x = 1;',
      errors: [{ messageId: 'missingReason' }],
    },
    {
      code: '/* eslint-disable */\nvar y;',
      errors: [{ messageId: 'missingReason' }],
    },
    {
      code: '// oxlint-disable-line no-alert\nwindow.alert("hi");',
      errors: [{ messageId: 'missingReason' }],
    },
  ],
});
