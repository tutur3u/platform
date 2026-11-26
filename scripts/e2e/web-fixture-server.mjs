#!/usr/bin/env node
/**
 * Deterministic loopback fixture server for zero-build, zero-secret CI replay
 * of the representative `apps/web` e2e suites. Mirrors the exact routes, ARIA
 * roles, labels, placeholders, and transitions of:
 * - /en/login (IdentifyStep + PasswordStep -> /en/personal)
 * - /en/personal/tasks/boards -> /en/personal/tasks/boards/default
 * - /en/r/e2e-guest-room (MeetGuestJoin -> guest lobby)
 *
 * Credentials are read strictly from environment variable names at runtime;
 * no credentials are hardcoded in source.
 */
import http from 'node:http';
import { pathToFileURL, URL } from 'node:url';

const FLEET_SMOKE_UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function resolveExpectedEmail(env = process.env) {
  const direct =
    env.E2E_SECRET_FLEET_EMAIL?.trim() ||
    env.E2E_USER_FLEET_USERNAME?.trim() ||
    env.E2E_FLEET_EMAIL?.trim() ||
    env.TUTURUUU_FLEET_SMOKE_EMAIL?.trim();
  if (direct) return direct;

  const requestId = env.TUTURUUU_FLEET_SMOKE_ID?.trim();
  if (requestId && FLEET_SMOKE_UUID_PATTERN.test(requestId)) {
    return `qa-automation+${requestId}@smoke.tuturuuu.com`;
  }
  return '';
}

function resolveExpectedPassword(env = process.env) {
  return (
    env.E2E_USER_FLEET_PASSWORD?.trim() ||
    env.E2E_FLEET_PASSWORD?.trim() ||
    env.TUTURUUU_FLEET_SMOKE_PASSWORD?.trim() ||
    ''
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (settled) return;
      raw += chunk;
      if (raw.length > 65_536) {
        settled = true;
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function parseCookies(req) {
  const header = req.headers.cookie ?? '';
  const map = new Map();
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    try {
      map.set(
        part.slice(0, idx).trim(),
        decodeURIComponent(part.slice(idx + 1).trim())
      );
    } catch {
      // Ignore malformed percent-encoding in cookies.
    }
  }
  return map;
}

function loginPageHtml() {
  return layout(
    'Sign in | Tuturuuu',
    `<main>
      <h1>Sign in to your account</h1>
      <form id="identify-form">
        <label for="login-email">Email or username</label>
        <input
          id="login-email"
          name="email"
          type="text"
          autocomplete="username"
          placeholder="Enter your email or username"
          required
        />
        <button type="submit">Continue with email</button>
      </form>
      <form id="password-form" data-testid="password-step" hidden>
        <h2>Enter your password</h2>
        <label for="locked-email">Email</label>
        <input id="locked-email" name="email" type="text" readonly aria-readonly="true" />
        <label for="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          required
        />
        <button type="submit">Sign In</button>
        <p id="login-error" role="alert" hidden></p>
      </form>
      <script>
        const identifyForm = document.getElementById('identify-form');
        const passwordForm = document.getElementById('password-form');
        const emailInput = document.getElementById('login-email');
        const lockedEmail = document.getElementById('locked-email');
        const passwordInput = document.getElementById('login-password');
        const errorBox = document.getElementById('login-error');

        identifyForm.addEventListener('submit', (event) => {
          event.preventDefault();
          const email = emailInput.value.trim();
          if (!email) return;
          lockedEmail.value = email;
          identifyForm.hidden = true;
          passwordForm.hidden = false;
          passwordInput.focus();
        });

        passwordForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          errorBox.hidden = true;
          const res = await fetch('/api/e2e-fixture/sign-in', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email: lockedEmail.value,
              password: passwordInput.value,
            }),
          });
          if (!res.ok) {
            errorBox.textContent = 'Invalid credentials';
            errorBox.hidden = false;
            return;
          }
          window.location.assign('/en/personal');
        });
      </script>
    </main>`
  );
}

function personalWorkspaceHtml() {
  return layout(
    'Personal Workspace | Tuturuuu',
    `<header>
      <nav aria-label="Workspace navigation">
        <a href="/en/personal">Overview</a>
        <a href="/en/personal/tasks/boards">Tasks</a>
      </nav>
    </header>
    <main>
      <h1>Personal Workspace</h1>
      <p role="status">Signed in</p>
    </main>`
  );
}

function tasksBoardsIndexHtml() {
  return layout(
    'Task Boards | Tuturuuu',
    `<main>
      <h1>Task Boards</h1>
      <ul aria-label="Active task boards">
        <li>
          <a href="/en/personal/tasks/boards/default">Personal Board</a>
        </li>
      </ul>
    </main>`
  );
}

function tasksBoardDetailHtml() {
  return layout(
    'Personal Board | Tuturuuu Tasks',
    `<main data-testid="task-board">
      <header>
        <h1>Personal Board</h1>
        <button type="button">Planner</button>
      </header>
      <section aria-label="Board columns">
        <article aria-label="Not Started">
          <h2>Not Started</h2>
          <ul>
            <li>Review Q4 onboarding checklist</li>
          </ul>
        </article>
        <article aria-label="Active">
          <h2>Active</h2>
          <ul>
            <li>Verify deterministic E2E replay cache</li>
          </ul>
        </article>
        <article aria-label="Done">
          <h2>Done</h2>
          <ul>
            <li>Bootstrap web test harness</li>
          </ul>
        </article>
      </section>
    </main>`
  );
}

function meetGuestJoinHtml(roomCode) {
  return layout(
    'Join meeting | Tuturuuu Meet',
    `<main>
      <form id="meet-guest-form">
        <p>Tuturuuu Meet</p>
        <h1>Join meeting</h1>
        <p data-testid="meet-room-code">Room: ${escapeHtml(roomCode)}</p>
        <div>
          <label for="meet-guest-display-name">Display name</label>
          <input
            id="meet-guest-display-name"
            name="displayName"
            type="text"
            autocomplete="name"
            placeholder="Your name"
            required
          />
        </div>
        <p aria-live="polite">Human check passed</p>
        <button type="submit">Ask to join</button>
        <a href="/en/login">Sign in with Tuturuuu</a>
      </form>
      <section id="meet-guest-lobby" hidden>
        <h1>Waiting in lobby</h1>
        <p id="meet-lobby-status" role="status"></p>
        <p data-testid="meet-guest-badge"></p>
      </section>
      <script>
        const form = document.getElementById('meet-guest-form');
        const input = document.getElementById('meet-guest-display-name');
        const lobby = document.getElementById('meet-guest-lobby');
        const status = document.getElementById('meet-lobby-status');
        const badge = document.querySelector('[data-testid="meet-guest-badge"]');

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const name = input.value.trim();
          if (!name) return;
          form.hidden = true;
          lobby.hidden = false;
          status.textContent = 'Waiting for the host to admit you';
          badge.textContent = 'Guest: ' + name;
        });
      </script>
    </main>`
  );
}

export function createFixtureServer(env = process.env) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(layout('Tuturuuu', '<main><h1>Tuturuuu</h1></main>'));
      return;
    }

    if (
      req.method === 'GET' &&
      (pathname === '/en/login' || pathname === '/login')
    ) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(loginPageHtml());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/e2e-fixture/sign-in') {
      try {
        const body = await readJsonBody(req);
        const expectedEmail = resolveExpectedEmail(env);
        const expectedPassword = resolveExpectedPassword(env);
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (
          !expectedEmail ||
          !expectedPassword ||
          email !== expectedEmail ||
          password !== expectedPassword
        ) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid credentials' }));
          return;
        }
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie':
            'ttr_e2e_fixture_session=authenticated; Path=/; HttpOnly; SameSite=Lax',
        });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/en/personal') {
      const cookies = parseCookies(req);
      if (cookies.get('ttr_e2e_fixture_session') !== 'authenticated') {
        res.writeHead(302, { location: '/en/login' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(personalWorkspaceHtml());
      return;
    }

    if (req.method === 'GET' && pathname === '/en/personal/tasks/boards') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(tasksBoardsIndexHtml());
      return;
    }

    if (
      req.method === 'GET' &&
      /^\/en\/personal\/tasks\/boards\/[^/]+$/u.test(pathname)
    ) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(tasksBoardDetailHtml());
      return;
    }

    const meetMatch = /^\/en\/r\/([^/]+)$/u.exec(pathname);
    if (req.method === 'GET' && meetMatch) {
      let roomCode;
      try {
        roomCode = decodeURIComponent(meetMatch[1]);
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Invalid room code');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(meetGuestJoinHtml(roomCode));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const portIndex = process.argv.indexOf('--port');
  const rawPort =
    portIndex !== -1 ? process.argv[portIndex + 1] : (process.env.PORT ?? '0');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    console.error(`Invalid port: ${rawPort}`);
    process.exit(2);
  }
  const server = createFixtureServer();
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address === 'object') {
      console.log(
        `e2e web fixture listening on http://127.0.0.1:${address.port}`
      );
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}
