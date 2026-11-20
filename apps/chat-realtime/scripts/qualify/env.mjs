// Configuration and private reporting for the chat realtime qualification.
// Reports name checks and outcomes only: identities, workspace and
// conversation IDs, tokens, origins and message text never reach the output,
// so a run is safe to keep in public CI logs.

const REQUIRED = [
  'QUALIFY_WEB_ORIGIN',
  'QUALIFY_SUPABASE_URL',
  'QUALIFY_SUPABASE_PUBLISHABLE_KEY',
  'QUALIFY_WORKSPACE_ID',
  'QUALIFY_MEMBER_A_EMAIL',
  'QUALIFY_MEMBER_A_PASSWORD',
  'QUALIFY_MEMBER_B_EMAIL',
  'QUALIFY_MEMBER_B_PASSWORD',
  'QUALIFY_OUTSIDER_EMAIL',
  'QUALIFY_OUTSIDER_PASSWORD',
];

function origin(name, value, { allowHttpLoopback }) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowHttpLoopback && loopback)) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username) {
    throw new Error(`${name} must be a bare origin`);
  }
  return url.origin;
}

export function readConfig(env = process.env) {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing qualification settings: ${missing.join(', ')}`);
  }
  const local = env.QUALIFY_LOCAL === '1';
  const options = { allowHttpLoopback: local };
  const config = {
    local,
    webOrigin: origin('QUALIFY_WEB_ORIGIN', env.QUALIFY_WEB_ORIGIN, options),
    supabaseUrl: origin(
      'QUALIFY_SUPABASE_URL',
      env.QUALIFY_SUPABASE_URL,
      options
    ),
    publishableKey: env.QUALIFY_SUPABASE_PUBLISHABLE_KEY.trim(),
    workspaceId: env.QUALIFY_WORKSPACE_ID.trim().toLowerCase(),
    secondWorkspaceId:
      env.QUALIFY_SECOND_WORKSPACE_ID?.trim().toLowerCase() || null,
    members: {
      a: {
        email: env.QUALIFY_MEMBER_A_EMAIL.trim(),
        password: env.QUALIFY_MEMBER_A_PASSWORD,
      },
      b: {
        email: env.QUALIFY_MEMBER_B_EMAIL.trim(),
        password: env.QUALIFY_MEMBER_B_PASSWORD,
      },
      outsider: {
        email: env.QUALIFY_OUTSIDER_EMAIL.trim(),
        password: env.QUALIFY_OUTSIDER_PASSWORD,
      },
    },
  };
  if (local) {
    for (const name of [
      'QUALIFY_SUPABASE_SECRET_KEY',
      'QUALIFY_REALTIME_SECRET',
      'QUALIFY_REALTIME_PORT',
    ]) {
      if (!env[name]?.trim()) throw new Error(`Local runs need ${name}`);
    }
    config.secretKey = env.QUALIFY_SUPABASE_SECRET_KEY.trim();
    config.realtimeSecret = env.QUALIFY_REALTIME_SECRET.trim();
    config.realtimePort = Number(env.QUALIFY_REALTIME_PORT);
  }
  return config;
}

export class QualificationError extends Error {}

export function check(condition, message) {
  if (!condition) throw new QualificationError(message);
}

/** Runs named checks in order and stops at the first failure. */
export function createReporter(write = (line) => console.log(line)) {
  const results = [];
  return {
    results,
    async step(name, run) {
      const started = Date.now();
      try {
        await run();
        results.push({ name, ok: true });
        write(`PASS ${name} (${Date.now() - started} ms)`);
      } catch (error) {
        results.push({ name, ok: false });
        // Our own assertions carry safe text; anything else is reduced to
        // its type so provider responses cannot leak identifiers.
        const reason =
          error instanceof QualificationError
            ? error.message
            : (error?.name ?? 'Error');
        write(`FAIL ${name}: ${reason}`);
        throw error;
      }
    },
  };
}
