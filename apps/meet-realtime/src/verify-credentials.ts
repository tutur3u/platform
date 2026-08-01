/**
 * Smoke-tests Cloudflare Realtime SFU credentials without ever printing them.
 *
 *   bun apps/meet-realtime/src/verify-credentials.ts
 *
 * Reads CLOUDFLARE_REALTIME_APP_ID and CLOUDFLARE_REALTIME_APP_SECRET from the
 * environment, opens a throwaway SFU session, and reports only whether the
 * handshake succeeded. Nothing derived from the secret is written to stdout, so
 * the output is safe to paste into a PR or a chat.
 */
import { CloudflareSfuClient } from '../../../packages/realtime/src/meet';

type SessionResponse = {
  sessionDescription?: { sdp?: string; type?: string };
  sessionId?: string;
};

function redactAppId(appId: string) {
  return appId.length <= 6
    ? '***'
    : `${appId.slice(0, 4)}…${appId.slice(-2)} (${appId.length} chars)`;
}

async function main() {
  const appId = process.env.CLOUDFLARE_REALTIME_APP_ID?.trim();
  const appSecret = process.env.CLOUDFLARE_REALTIME_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    process.stdout.write(
      'FAIL: set CLOUDFLARE_REALTIME_APP_ID and CLOUDFLARE_REALTIME_APP_SECRET first.\n' +
        'Put them in apps/meet-realtime/.dev.vars (gitignored) or export them.\n'
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`app id: ${redactAppId(appId)}\n`);
  process.stdout.write(`app secret: present (${appSecret.length} chars)\n`);

  const client = new CloudflareSfuClient({ appId, appSecret });

  try {
    const session = (await client.createSession()) as SessionResponse;

    if (!session.sessionId) {
      process.stdout.write(
        'FAIL: Cloudflare accepted the request but returned no sessionId.\n'
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write(
      `PASS: created SFU session ${session.sessionId.slice(0, 8)}… ` +
        `(offer: ${session.sessionDescription?.type ?? 'none'})\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`FAIL: ${message}\n`);

    if (message.includes(':401') || message.includes(':403')) {
      process.stdout.write(
        'The app id and secret were rejected. Confirm the secret belongs to ' +
          'that app and that Realtime is enabled on the account.\n'
      );
    }

    process.exitCode = 1;
  }
}

await main();
