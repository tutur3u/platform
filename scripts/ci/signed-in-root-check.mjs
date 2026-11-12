import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Headless-Chrome check of a SIGNED-IN root page: load <url> with the session
// cookies from a JSON file, wait for the app to settle, and judge the final
// location, the visible text and the browser's errors. Cookie values are only
// handed to Chrome; they are never printed.
//
// usage: signed-in-root-check.mjs <url> <cookies.json> [chrome-binary]
//   cookies.json: [{ "name": "...", "value": "...", "domain": "chat.example", "secure": true }]

const BOUNDARY =
  /Something went wrong|RECOVERY MODE|Recovery mode|Application error|This view could not load/u;
const REACT_RENDER_ERROR = /Minified React error #\d+/u;

/**
 * Judge what the browser saw. `finalUrl` is where it ended up, `text` the
 * visible body text, `errors` uncaught exceptions plus console errors.
 * Returns the list of problems (empty = pass).
 */
export function judgeSignedInRoot({ requestedUrl, finalUrl, text, errors }) {
  const problems = [];
  const requested = new URL(requestedUrl);
  const final = new URL(finalUrl);
  if (BOUNDARY.test(text ?? ''))
    problems.push(
      `the error boundary is showing: "${(text ?? '').slice(0, 80)}"`
    );
  if (
    final.origin === requested.origin &&
    final.pathname === requested.pathname
  )
    problems.push(
      `the signed-in root stayed on ${final.pathname}; expected a redirect to the workspace`
    );
  if (/\/login(?:[/?#]|$)/u.test(final.pathname))
    problems.push('the session was not accepted: the browser ended on /login');
  for (const error of errors ?? [])
    problems.push(
      REACT_RENDER_ERROR.test(error)
        ? `React render error: ${error.slice(0, 160)}`
        : `browser error: ${error.slice(0, 160)}`
    );
  return problems;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function run([url, cookiesFile, chromeBinary]) {
  const cookies = JSON.parse(readFileSync(cookiesFile, 'utf8'));
  const binary =
    chromeBinary ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const dir = mkdtempSync(join(tmpdir(), 'signed-in-root-'));
  const chrome = spawn(
    binary,
    [
      '--headless=new',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--disable-gpu',
      '--remote-debugging-port=0',
      '--window-size=1440,1000',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  try {
    let port;
    for (let i = 0; i < 100 && !port; i += 1) {
      await sleep(100);
      const file = `${dir}/DevToolsActivePort`;
      if (existsSync(file)) port = readFileSync(file, 'utf8').split('\n')[0];
    }
    if (!port) throw new Error('Chrome did not expose a debugging port');
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    const ws = new WebSocket(
      targets.find((target) => target.type === 'page').webSocketDebuggerUrl
    );
    await new Promise((open) => ws.addEventListener('open', open));
    let counter = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener('message', (message) => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      } else events.push(data);
    });
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++counter;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    for (const cookie of cookies)
      await send('Network.setCookie', { path: '/', secure: true, ...cookie });
    await send('Page.navigate', { url });
    await sleep(8000);
    const page = JSON.parse(
      (
        await send('Runtime.evaluate', {
          expression:
            'JSON.stringify({href: location.href, text: (document.body && document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 300)})',
          returnByValue: true,
        })
      ).result?.result?.value ?? '{}'
    );
    const errors = [
      ...events
        .filter((event) => event.method === 'Runtime.exceptionThrown')
        .map(
          (event) =>
            event.params.exceptionDetails.exception?.description ??
            event.params.exceptionDetails.text
        ),
      ...events
        .filter(
          (event) =>
            event.method === 'Runtime.consoleAPICalled' &&
            event.params.type === 'error'
        )
        .map((event) =>
          event.params.args
            .map((arg) => arg.value ?? arg.description ?? '')
            .join(' ')
        ),
    ].map((error) => String(error).split('\n')[0]);
    ws.close();
    return judgeSignedInRoot({
      requestedUrl: url,
      finalUrl: page.href ?? url,
      text: page.text,
      errors,
    });
  } finally {
    chrome.kill();
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      'usage: signed-in-root-check.mjs <url> <cookies.json> [chrome-binary]'
    );
    process.exit(2);
  }
  const problems = await run(args);
  if (problems.length > 0) {
    console.error(`signed-in root check FAILED for ${args[0]}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`signed-in root check passed for ${args[0]}`);
}
