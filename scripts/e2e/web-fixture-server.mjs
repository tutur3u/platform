#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL, URL } from 'node:url';
import {
  ADMISSION_TTL_SECONDS,
  issueRoomAdmission,
  ROOM_LEASE_SECONDS,
  verifyRoomAdmission,
} from '../../apps/worlds/src/multiplayer/admission.ts';
import enMessages from '../../apps/web/messages/en.json' with { type: 'json' };
import viMessages from '../../apps/web/messages/vi.json' with { type: 'json' };
import {
  resolveFleetEmailFromEnv,
  resolveFleetPasswordFromEnv,
} from './shared-web-config.ts';

const messages = { en: enMessages, vi: viMessages };
const hallScope = {
  worldId: 'edufest-hall',
  revision: 'edufest-hall-v1',
  shard: 0,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(title, body, locale = 'en') {
  return `<!doctype html>
<html lang="${locale}">
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

function loginPageHtml(locale) {
  const copy = messages[locale].login;
  return layout(
    `${copy.sign_in} | Tuturuuu`,
    `<main>
      <h1>${escapeHtml(copy.welcome_to_tuturuuu)}</h1>
      <form id="identify-form">
        <label for="login-email">${escapeHtml(copy.email_or_username)}</label>
        <input
          id="login-email"
          name="email"
          type="text"
          autocomplete="username"
          placeholder="${escapeHtml(copy.email_username_placeholder)}"
          required
        />
        <button type="submit">${escapeHtml(copy.continue_with_email)}</button>
      </form>
      <form id="password-form" data-testid="password-step" hidden>
        <h2>${escapeHtml(copy.password_title)}</h2>
        <label for="locked-email">${escapeHtml(copy.email)}</label>
        <input id="locked-email" name="email" type="text" readonly aria-readonly="true" />
        <label for="login-password">${escapeHtml(copy.password)}</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="${escapeHtml(copy.password_placeholder)}"
          required
        />
        <button type="submit">${escapeHtml(copy.sign_in)}</button>
        <p id="login-error" role="alert" data-message="${escapeHtml(copy.invalid_credentials)}" hidden></p>
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
            errorBox.textContent = errorBox.dataset.message;
            errorBox.hidden = false;
            return;
          }
          window.location.assign('/${locale}/personal');
        });
      </script>
    </main>`,
    locale
  );
}

function personalWorkspaceHtml(locale) {
  const heading =
    locale === 'vi' ? 'Không gian làm việc cá nhân' : 'Personal Workspace';
  const status = locale === 'vi' ? 'Đã đăng nhập' : 'Signed in';
  return layout(
    `${heading} | Tuturuuu`,
    `<main><h1>${heading}</h1><p role="status">${status}</p></main>`,
    locale
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
    `<main>
      <h1>Personal Board</h1>
      <button type="button">Planner</button>
      <input id="search" type="text" aria-label="Search tasks..." placeholder="Search tasks..." />
      <section id="columns" aria-label="Board columns">
        <article aria-label="Not Started">
          <h2>Not Started</h2>
          <ul><li data-testid="task-card">Review Q4 onboarding checklist</li></ul>
        </article>
        <article aria-label="Active">
          <h2>Active</h2>
          <ul><li data-testid="task-card">Verify deterministic E2E replay cache</li></ul>
        </article>
        <article aria-label="Done">
          <h2>Done</h2>
          <ul><li data-testid="task-card">Bootstrap web test harness</li></ul>
        </article>
      </section>
      <section id="filtered-empty" hidden>
        <p role="status">No tasks match the current filters</p>
        <button id="clear" type="button">Clear filters</button>
      </section>
      <script>
        const search = document.getElementById('search');
        const columns = document.getElementById('columns');
        const empty = document.getElementById('filtered-empty');
        const cards = [...columns.querySelectorAll('li')];
        function filterCards() {
          const query = search.value.trim().toLowerCase();
          for (const card of cards) card.hidden = !card.textContent.toLowerCase().includes(query);
          const noMatches = cards.every((card) => card.hidden);
          columns.hidden = noMatches;
          empty.hidden = !noMatches;
        }
        search.addEventListener('input', filterCards);
        document.getElementById('clear').addEventListener('click', () => {
          search.value = '';
          filterCards();
          search.focus();
        });
      </script>
    </main>`
  );
}

function meetGuestJoinHtml(roomCode) {
  return layout(
    'Join meeting | Tuturuuu Meet',
    `<main>
      <h1>Join meeting</h1>
      <p>Room: ${escapeHtml(roomCode)}</p>
      <form id="meet-guest-form">
        <section aria-label="Camera preview">
          <p id="camera-readiness">Camera is off</p>
          <button id="camera" type="button" aria-pressed="true">Turn camera on</button>
          <button id="microphone" type="button" aria-pressed="true">Unmute microphone</button>
        </section>
        <label for="meet-guest-display-name">Display name</label>
        <input id="meet-guest-display-name" name="displayName" autocomplete="name" placeholder="Your name" maxlength="80" required />
        <p>Human check passed</p>
        <button type="submit" disabled>Ask to join</button>
        <a href="/en/login">Sign in with Tuturuuu</a>
      </form>
      <p id="meet-status" role="status" hidden></p>
      <section aria-label="Meeting room" id="meet-room" hidden>
        <p id="guest-name"></p>
        <a href="/en/r/${encodeURIComponent(roomCode)}">Leave call</a>
      </section>
      <script>
        const form = document.getElementById('meet-guest-form');
        const input = form.elements.displayName;
        const ask = form.querySelector('[type=submit]');
        const camera = document.getElementById('camera');
        const mic = document.getElementById('microphone');
        const status = document.getElementById('meet-status');
        const isOff = (button) => button.getAttribute('aria-pressed') === 'true';

        function bindToggle(button, onLabel, offLabel) {
          button.addEventListener('click', () => {
            const turnOn = isOff(button);
            button.setAttribute('aria-pressed', String(!turnOn));
            button.textContent = turnOn ? offLabel : onLabel;
            document.getElementById('camera-readiness').textContent =
              isOff(camera) ? 'Camera is off' : 'Camera is on';
          });
        }
        bindToggle(camera, 'Turn camera on', 'Turn camera off');
        bindToggle(mic, 'Unmute microphone', 'Mute microphone');
        input.addEventListener('input', () => { ask.disabled = !input.value.trim(); });

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          ask.disabled = true;
          status.hidden = false;
          status.textContent = 'Waiting for the host to let you in';
          try {
            const response = await fetch('/api/e2e-fixture/meet/guest', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                displayName: input.value.trim(),
                camera: !isOff(camera),
                microphone: !isOff(mic),
              }),
            });
            if (!response.ok) throw new Error('Guest admission failed');
            const guest = await response.json();
            if (guest.status !== 'joined') throw new Error('Guest admission incomplete');
            form.hidden = true;
            status.textContent = 'In meeting';
            document.getElementById('guest-name').textContent = guest.displayName + ' (you)';
            document.getElementById('meet-room').hidden = false;
          } catch {
            ask.disabled = false;
            status.textContent = 'Could not join meeting';
          }
        });
      </script>
    </main>`
  );
}

function edufestHallHtml() {
  return layout(
    'EduFest hall',
    `<main>
      <h1>EduFest hall</h1>
      <button id="guest-entry" type="button">Join as guest</button>
      <form id="hall-guest-form" hidden>
        <label for="hall-display-name">Display name</label>
        <input id="hall-display-name" name="displayName" autocomplete="name" maxlength="80" required />
        <button type="submit">Join room</button>
      </form>
      <p id="hall-status" role="status"></p>
      <section aria-label="Hall floor plan">
        <span>Entrance</span>
        <span>Stage</span>
        <span id="hall-self" role="img" aria-label="You" hidden>●</span>
      </section>
      <button id="hall-leave" type="button" hidden>Leave room</button>
      <script>
        const entry = document.getElementById('guest-entry');
        const form = document.getElementById('hall-guest-form');
        const status = document.getElementById('hall-status');
        const self = document.getElementById('hall-self');
        const leave = document.getElementById('hall-leave');
        const join = form.querySelector('[type=submit]');
        entry.addEventListener('click', () => {
          entry.hidden = true;
          form.hidden = false;
          form.elements.displayName.focus();
        });
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          join.disabled = true;
          status.textContent = 'Joining room…';
          try {
            const admission = await fetch('/api/e2e-fixture/worlds/admission', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ displayName: form.elements.displayName.value.trim() }),
            });
            if (!admission.ok) throw new Error('Admission failed');
            const response = await fetch('/api/e2e-fixture/worlds/room');
            if (!response.ok) throw new Error('Room unavailable');
            const frame = await response.json();
            if (frame.type !== 'ready') throw new Error('Room not ready');
            self.textContent = frame.self.displayName;
            self.hidden = false;
            form.hidden = true;
            leave.hidden = false;
            status.textContent = 'In room';
          } catch {
            status.textContent = 'Could not join or stay connected.';
          } finally {
            join.disabled = false;
          }
        });
        leave.addEventListener('click', () => {
          self.hidden = true;
          leave.hidden = true;
          status.textContent = '';
          entry.hidden = false;
        });
      </script>
    </main>`
  );
}

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function html(res, body) {
  reply(res, 200, body, { 'content-type': 'text/html; charset=utf-8' });
}

function json(res, status, body, headers) {
  reply(res, status, JSON.stringify(body), {
    'content-type': 'application/json',
    ...headers,
  });
}

function getDisplayName(body) {
  const name =
    typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  return name.length <= 80 ? name : '';
}

export function createFixtureServer(env = process.env) {
  const expectedEmail = resolveFleetEmailFromEnv(env);
  const expectedPassword = resolveFleetPasswordFromEnv(env);
  const loginSession = randomUUID();
  const hallKey = randomUUID();
  const pendingHallGuests = new Map();

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
      if (req.method === 'GET') {
        const authRoute = /^\/(en|vi)\/(login|personal)$/u.exec(pathname);
        if (pathname === '/login') return html(res, loginPageHtml('en'));
        if (authRoute) {
          const [, locale, page] = authRoute;
          if (page === 'login') return html(res, loginPageHtml(locale));
          if (
            parseCookies(req).get('ttr_e2e_fixture_session') !== loginSession
          ) {
            return reply(res, 302, undefined, { location: `/${locale}/login` });
          }
          return html(res, personalWorkspaceHtml(locale));
        }
        if (pathname === '/')
          return html(
            res,
            layout('Tuturuuu', '<main><h1>Tuturuuu</h1></main>')
          );
        if (pathname === '/en/personal/tasks/boards')
          return html(res, tasksBoardsIndexHtml());
        if (pathname === '/en/personal/tasks/boards/default')
          return html(res, tasksBoardDetailHtml());
        const meetRoom = /^\/en\/r\/([^/]+)$/u.exec(pathname);
        if (meetRoom)
          return html(res, meetGuestJoinHtml(decodeURIComponent(meetRoom[1])));
        if (pathname === '/worlds') return html(res, edufestHallHtml());
        if (pathname === '/api/e2e-fixture/worlds/room') {
          const grant = parseCookies(req).get('ttr_e2e_hall_admission');
          const admission =
            grant && (await verifyRoomAdmission(grant, hallKey));
          const guest = admission && pendingHallGuests.get(admission.actorId);
          if (!guest) return json(res, 401, { error: 'Admission required' });
          pendingHallGuests.delete(admission.actorId);
          return json(res, 200, {
            type: 'ready',
            self: {
              id: admission.actorId,
              displayName: guest.displayName,
              x: 0,
              z: 0,
            },
            peers: [],
            leaseUntil: admission.leaseUntil,
          });
        }
      }
      if (req.method === 'POST') {
        if (pathname === '/api/e2e-fixture/sign-in') {
          const body = await readJsonBody(req);
          if (
            !expectedEmail ||
            !expectedPassword ||
            body?.email !== expectedEmail ||
            body?.password !== expectedPassword
          ) {
            return json(res, 401, { error: 'Invalid credentials' });
          }
          return json(
            res,
            200,
            { ok: true },
            {
              'set-cookie': `ttr_e2e_fixture_session=${loginSession}; Path=/; HttpOnly; SameSite=Lax`,
            }
          );
        }
        if (pathname === '/api/e2e-fixture/meet/guest') {
          const body = await readJsonBody(req);
          const displayName = getDisplayName(body);
          if (
            !displayName ||
            typeof body.camera !== 'boolean' ||
            typeof body.microphone !== 'boolean'
          ) {
            return json(res, 400, {
              error: 'Display name and media preferences required',
            });
          }
          return json(res, 200, {
            status: 'joined',
            displayName,
            camera: body.camera,
            microphone: body.microphone,
          });
        }
        if (pathname === '/api/e2e-fixture/worlds/admission') {
          // Guest identities and HTTP room frames are confined to the loopback fixture.
          const displayName = getDisplayName(await readJsonBody(req));
          if (!displayName)
            return json(res, 400, { error: 'Display name required' });
          const now = Math.floor(Date.now() / 1000);
          for (const [id, guest] of pendingHallGuests) {
            if (guest.expiresAt <= now) pendingHallGuests.delete(id);
          }
          if (pendingHallGuests.size >= 32)
            return json(res, 503, { error: 'Admissions full' });
          const id = randomUUID();
          pendingHallGuests.set(id, {
            displayName,
            expiresAt: now + ADMISSION_TTL_SECONDS,
          });
          const grant = await issueRoomAdmission(
            hallScope,
            async () => ({
              id,
              sessionExpiresAt: now + ROOM_LEASE_SECONDS,
            }),
            hallKey,
            () => now * 1000
          );
          return reply(res, 204, undefined, {
            'set-cookie': `ttr_e2e_hall_admission=${grant}; Path=/api/e2e-fixture/worlds/room; Max-Age=${ADMISSION_TTL_SECONDS}; HttpOnly; SameSite=Lax`,
          });
        }
      }
      return reply(res, 404, 'Not found');
    } catch {
      return json(res, 400, { error: 'Bad request' });
    }
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
