const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function fixture(t, app = 'mail') {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'wave1-artifact-'))
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sub of ['dist/server', 'dist/client/assets', '.wrangler/deploy'])
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dist/server/index.js'),
    'export default { fetch() { return new Response("fixture"); } };'
  );
  fs.writeFileSync(
    path.join(dir, 'dist/client/assets/app.js'),
    'console.log("fixture");'
  );
  fs.writeFileSync(
    path.join(dir, '.wrangler/deploy/config.json'),
    JSON.stringify({
      auxiliaryWorkers: [],
      configPath: '../../dist/server/wrangler.json',
    })
  );
  fs.writeFileSync(
    path.join(dir, 'dist/server/wrangler.json'),
    JSON.stringify({
      name:
        app === 'apps'
          ? 'tuturuuu-apps-vite-staging'
          : app === 'web'
            ? 'tuturuuu-web-start-candidate'
            : `tuturuuu-${app}`,
      no_bundle: true,
      main: './index.js',
      compatibility_date: app === 'apps' ? '2026-10-12' : '2026-10-19',
      compatibility_flags:
        app === 'apps'
          ? ['nodejs_compat']
          : ['nodejs_compat', 'global_fetch_strictly_public'],
      vars:
        app === 'web'
          ? {
              WEB_START_CANDIDATE: 'off',
              WEB_START_NATIVE_LEGAL: 'off',
              WEB_START_NATIVE_SECURITY: 'off',
              AUTH_COOKIE_PREFIX: '__Host-',
              NEXT_PUBLIC_SUPABASE_URL:
                'https://fxefojytwimjiqxseqag.supabase.co',
            }
          : app === 'apps'
            ? { TUTURUUU_NOINDEX: '1' }
            : app === 'mail'
              ? {
                  NEXT_PUBLIC_APP_URL: 'https://mail.tuturuuu.com',
                  NEXT_PUBLIC_MAIL_APP_URL: 'https://mail.tuturuuu.com',
                  NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
                }
              : {},
      rules: [{ type: 'ESModule', globs: ['**/*.js'] }],
      assets: {
        directory: '../client',
        binding: 'ASSETS',
        run_worker_first: true,
        not_found_handling: 'none',
      },
    })
  );
  return dir;
}
module.exports = { fixture };
