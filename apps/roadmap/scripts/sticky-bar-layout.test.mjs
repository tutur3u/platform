import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// Point this suite at an inactive artifact preview before promotion.
const url = process.env.ROADMAP_LAYOUT_URL;
let chrome;
let socket;
let profile;
let sequence = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert.equal(result.exceptionDetails, undefined);
  return result.result.value;
}
const settle = () =>
  evaluate('new Promise(resolve => setTimeout(resolve, 400))');

before(async () => {
  if (!url) return;
  profile = await mkdtemp(join(tmpdir(), 'roadmap-layout-'));
  chrome = spawn(
    process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      '--disable-gpu',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Chrome startup timeout')),
      15_000
    );
    chrome.once('error', reject);
    chrome.stderr.on('data', (chunk) => {
      const match = chunk
        .toString()
        .match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const origin = new URL(endpoint).origin.replace('ws:', 'http:');
  const pages = await (await fetch(`${origin}/json`)).json();
  socket = new WebSocket(
    pages.find((page) => page.type === 'page').webSocketDebuggerUrl
  );
  await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await send('Page.enable');
  await send('Page.navigate', { url });
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const check = () => document.querySelector('.sticky-bar .track-nav a')
      ? document.fonts.ready.then(resolve)
      : Date.now() > deadline ? reject(new Error('Roadmap did not render'))
      : setTimeout(check, 50);
    check();
  })`);
  // Optional source-CSS projection against the real preview DOM. Release proof
  // runs without this override against the freshly built candidate artifact.
  if (process.env.ROADMAP_LAYOUT_SOURCE_CSS) {
    const css = (
      await readFile(process.env.ROADMAP_LAYOUT_SOURCE_CSS, 'utf8')
    ).replace(/^@(import|source).*;$/gm, '');
    await evaluate(`(() => {
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.append(style);
    })()`);
  }
});

after(async () => {
  if (socket?.readyState === WebSocket.OPEN) await send('Browser.close');
  socket?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = once(chrome, 'exit');
    chrome.kill();
    await exited;
  }
  if (profile) await rm(profile, { recursive: true, force: true });
});

for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
  test(
    `sticky controls fit and remain reachable at ${width}px`,
    { skip: !url },
    async () => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: width === 390 ? 844 : 900,
        deviceScaleFactor: 1,
        mobile: width === 390,
      });
      await evaluate('scrollTo(0, 0)');
      await settle();
      const target = await evaluate(`(() => {
      const bar = document.querySelector('.sticky-bar');
      return bar.getBoundingClientRect().top + scrollY + 160;
    })()`);
      await evaluate(`scrollTo(0, ${target})`);
      await settle();
      const layout = await evaluate(`(() => {
      const bar = document.querySelector('.sticky-bar').getBoundingClientRect();
      const nav = document.querySelector('#navbar').getBoundingClientRect();
      return { viewport: innerWidth, page: document.documentElement.scrollWidth,
        left: bar.left, right: bar.right, top: bar.top, bottom: bar.bottom, navTop: nav.top, navBottom: nav.bottom,
        compact: document.querySelector('.roadmap').hasAttribute('data-nav-compact') };
    })()`);
      assert.ok(layout.compact, 'exercise the docked layout');
      assert.ok(layout.page <= layout.viewport + 1, JSON.stringify(layout));
      assert.ok(
        layout.left >= -1 && layout.right <= width + 1,
        JSON.stringify(layout)
      );
      assert.ok(layout.top >= layout.navTop + 4, JSON.stringify(layout));
      assert.ok(layout.bottom <= layout.navBottom - 4, JSON.stringify(layout));
      const rows = await evaluate(`(() => {
        const controls = [...document.querySelectorAll('.track-nav a, .filters button')];
        const centers = controls.map(el => {
          const rect = el.getBoundingClientRect();
          return rect.top + rect.height / 2;
        });
        return Math.max(...centers) - Math.min(...centers);
      })()`);
      assert.ok(rows <= 1, 'compact chips and filters occupy one row');
      const reachable = await evaluate(`(() => {
      const row = document.querySelector('.sticky-bar');
      const last = row.querySelector('.filters button:last-child');
      last.focus({ preventScroll: true });
      row.scrollLeft = row.scrollWidth;
      const item = last.getBoundingClientRect(), bounds = row.getBoundingClientRect();
      return item.right <= bounds.right + 1 && item.left >= bounds.left - 1;
    })()`);
      assert.ok(reachable, 'the last chip remains reachable by scrolling');
      console.log(JSON.stringify({ width, ...layout }));
    }
  );
}
