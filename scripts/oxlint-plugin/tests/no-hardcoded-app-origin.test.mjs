import { RuleTester } from 'oxlint/plugins-dev';
import rule from '../rules/no-hardcoded-app-origin.mjs';

const filename = '/repo/apps/web/src/example.ts';
const tester = new RuleTester();
tester.run('no-hardcoded-app-origin', rule, {
  valid: [
    {
      filename,
      code: "createPageMetadata({ baseUrl: 'https://git.tuturuuu.com' });",
    },
    {
      filename,
      code: "const example = `fetch('https://ai.tuturuuu.com/api/chat')`;",
    },
    {
      filename,
      code: "handleTaskRoutePOST(new NextRequest('https://meet.tuturuuu.com/internal/task-followup'));",
    },
    { filename, code: "const allowedHosts = ['https://tasks.tuturuuu.com'];" },
    {
      filename,
      code: "const apiUrl = resolveInternalAppUrl('https://tasks.tuturuuu.com');",
    },
    { filename, code: "fetch('https://example.com/path');" },
    {
      filename: '/repo/apps/web/src/example.test.ts',
      code: "fetch('http://localhost:7809');",
    },
    {
      filename: '/repo/apps/web/next.config.ts',
      code: "const apiUrl = 'http://localhost:7809';",
    },
  ],
  invalid: [
    "fetch('https://ai.tuturuuu.com/v1/colab/responses');",
    "const DEFAULT_TASKS_BASE_URL = 'https://tasks.tuturuuu.com';",
    "const apiUrl = 'http://localhost:7809';",
    'fetch(`https://app.tutur3u.com/api/${id}`);',
    "fetch('https://my-app.vercel.app/api');",
  ].map((code) => ({
    filename,
    code,
    errors: [{ messageId: 'hardcodedOrigin' }],
  })),
});
