import type { TuturuuuUserClient } from '../platform';
import type { FlagValue } from './args';
import { runDevboxCommand } from './devbox';

/** Local diagnostics and agent commands must work without an operator session. */
export async function runDevboxCommandWithSession({
  action,
  firstId = '',
  argv,
  baseUrl,
  hasSession,
  createClient,
  flags,
  json,
}: {
  action?: string;
  firstId?: string;
  argv: string[];
  baseUrl: string;
  hasSession: boolean;
  createClient: () => TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  const local =
    action === 'doctor' ||
    action === 'repair' ||
    (action === 'judge' && firstId === 'doctor') ||
    (action === 'agent' && ['start', 'policy'].includes(firstId));
  let client: TuturuuuUserClient | undefined;
  if (!local && (action !== 'setup' || hasSession)) client = createClient();
  await runDevboxCommand({ action, argv, baseUrl, client, flags, json });
}
