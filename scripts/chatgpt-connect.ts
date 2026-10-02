import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import {
  completeAuthorization,
  createAuthorization,
  validateCallback,
} from '../apps/web/src/lib/chatgpt/oauth';
import {
  credentialPath,
  registrationSchema,
  withChatGPTStore,
} from '../apps/web/src/lib/chatgpt/storage';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    client: { type: 'string' },
    import: { type: 'string' },
    help: { type: 'boolean' },
  },
});

async function main() {
  if (values.help || !values.user) {
    console.log(
      'Usage: bun scripts/chatgpt-connect.ts --user <Tuturuuu user UUID> [--client <issued client ID>] [--import <protected credential file>]'
    );
    console.log(
      'Completes ChatGPT plan sign-in locally. Credentials stay in protected runtime storage.'
    );
    return;
  }
  const userId = values.user;
  // This validates the owner before opening a browser or reading an import.
  credentialPath(userId);
  if (values.import) {
    const imported = JSON.parse(await readFile(values.import, 'utf8')) as {
      registrations?: unknown[];
    };
    if (!imported || !Array.isArray(imported.registrations))
      throw new Error('Invalid credential import');
    const registrations = imported.registrations.map((entry) =>
      registrationSchema.parse(entry)
    );
    await withChatGPTStore(userId, async (store) => {
      for (const entry of registrations) {
        const existing = store.registrations.find(
          (saved) => saved.clientId === entry.clientId
        );
        if (existing && existing.subject !== entry.subject)
          throw new Error('Account identity mismatch');
        if (existing) Object.assign(existing, entry);
        else store.registrations.push(entry);
      }
      // Preserve this runtime's host ID rather than importing the laptop's.
    });
    console.log(
      'Imported ChatGPT registrations. This runtime owns subsequent refreshes.'
    );
    return;
  }
  const { hostId, saved } = await withChatGPTStore(userId, async (store) => ({
    hostId: store.hostId,
    saved: values.client
      ? store.registrations.find((entry) => entry.clientId === values.client)
      : undefined,
  }));
  if (values.client && !saved)
    throw new Error('Unknown saved ChatGPT registration');
  let consumed = false;
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Callback listener is unavailable');
  const attempt = createAuthorization(
    hostId,
    `http://127.0.0.1:${address.port}/auth/callback`,
    saved
  );
  try {
    await new Promise<void>((resolveAuthorization, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('ChatGPT sign-in timed out')),
        5 * 60 * 1000
      );
      server.on('request', async (request, response) => {
        const url = new URL(request.url ?? '/', attempt.redirectUri);
        if (
          request.method !== 'GET' ||
          url.pathname !== '/auth/callback' ||
          consumed
        ) {
          response.writeHead(404).end();
          return;
        }
        try {
          validateCallback(url, attempt);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'ChatGPT authorization was declined'
          ) {
            consumed = true;
            clearTimeout(timeout);
            response
              .writeHead(400)
              .end('ChatGPT authorization was declined. Close this tab.');
            reject(new Error('ChatGPT authorization was declined'));
            return;
          }
          response
            .writeHead(400)
            .end('Invalid callback. Return to the sign-in browser.');
          return;
        }
        consumed = true;
        try {
          const registration = await completeAuthorization(url, attempt);
          await withChatGPTStore(userId, async (store) => {
            const existing = store.registrations.find(
              (entry) => entry.clientId === registration.clientId
            );
            if (existing && existing.subject !== registration.subject)
              throw new Error('Account identity mismatch');
            if (existing) Object.assign(existing, registration);
            else store.registrations.push(registration);
          });
          response
            .writeHead(200, {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-store',
            })
            .end('ChatGPT connected. Close this tab and return to Tuturuuu.');
          clearTimeout(timeout);
          resolveAuthorization();
        } catch {
          response
            .writeHead(400)
            .end('ChatGPT connection failed. Start a new sign-in.');
          clearTimeout(timeout);
          reject(new Error('ChatGPT connection failed'));
        }
      });
      const command =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'rundll32'
            : 'xdg-open';
      const args =
        process.platform === 'win32'
          ? ['url.dll,FileProtocolHandler', attempt.url.toString()]
          : [attempt.url.toString()];
      const browser = spawn(command, args, { stdio: 'ignore' });
      browser.once('exit', (code) => {
        if (code && !consumed) {
          clearTimeout(timeout);
          reject(new Error('Could not open the system browser'));
        }
      });
      browser.once('error', () => {
        clearTimeout(timeout);
        reject(new Error('Could not open the system browser'));
      });
      console.log(
        'Complete Continue with ChatGPT in your system browser. Authorization URLs and tokens are not printed.'
      );
    });
    console.log(
      'ChatGPT connected. Refresh Tuturuuu to choose this account and its available models.'
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

main().catch((error: unknown) => {
  const safeMessages = [
    'ChatGPT sign-in timed out',
    'Unknown saved ChatGPT registration',
    'Invalid credential import',
    'Account identity mismatch',
    'Could not open the system browser',
    'ChatGPT authorization was declined',
    'ChatGPT credential file must have owner-only permissions',
    'Invalid Tuturuuu user ID',
    'ChatGPT storage must be a private directory',
    'ChatGPT connection is busy; retry shortly',
  ];
  if (error instanceof Error && safeMessages.includes(error.message))
    console.error(error.message);
  console.error(
    'ChatGPT connection could not be completed. Check arguments and protected storage permissions, then retry.'
  );
  process.exitCode = 1;
});
