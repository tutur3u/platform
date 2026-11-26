import { getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import { parseWatchInterval, runWatchLoop } from '../ui/watch';
import { assertSafeParsedValue, assertSafeResponseText } from './http';
import {
  rethrowUnavailableEndpoint,
  type UpskiiProductClient,
} from './product-client';

const TUTURUUU_UPSKII_LINK_PATH = '/api/v1/integrations/upskii/link';

export interface UpskiiLinkCommandOptions {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  fetch?: typeof globalThis.fetch;
  json: boolean;
  noColor?: boolean;
  tuturuuuAccessToken?: string;
  write?: (chunk: string) => void;
}

export function upskiiLinkHelp(): string {
  return [
    'ttr external upskii link — inspect and manage Upskii <-> Tuturuuu (E3) account links',
    '',
    'Usage:',
    '  ttr external upskii link status [--session-file <path>] [--watch [seconds]] [--json]',
    '  ttr external upskii link verify [--session-file <path>] [--json]',
    '  ttr external upskii link connect-url [--experience educator|learn] [--json]',
    '  ttr external upskii link unlink [--side upskii|tuturuuu|both] [--yes --confirm UNLINK_UPSKII]',
  ].join('\n');
}

export async function runUpskiiLinkCommand(
  options: UpskiiLinkCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'status'] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiLinkHelp()}\n`);
    return;
  }

  const { client, env, json, noColor } = options;

  if (action === 'connect-url') {
    const url = `${client.origins.app}/?connect=tuturuuu`;
    if (json) {
      write(
        `${JSON.stringify({ connectUrl: url, env, note: 'Opens Upskii session-bound PKCE consent flow.' }, null, 2)}\n`
      );
      return;
    }
    write(`Open in an authenticated Upskii browser session:\n${url}\n`);
    return;
  }

  if (action === 'status' || action === 'verify') {
    const watchSeconds = parseWatchInterval(flags.watch, 15);
    const readSnapshot = async () => {
      const linkPath = `${client.apiBase}/integrations/tuturuuu`;
      let upskiiRes: Awaited<
        ReturnType<
          typeof client.requestJson<{
            confirmed?: boolean;
            enabled?: boolean;
            link?: Record<string, unknown> | null;
          }>
        >
      >;
      try {
        upskiiRes = await client.requestJson<{
          confirmed?: boolean;
          enabled?: boolean;
          link?: Record<string, unknown> | null;
        }>({
          command: `external.upskii.link.${action}`,
          path: linkPath,
        });
      } catch (error) {
        rethrowUnavailableEndpoint(
          error,
          'Upskii <-> Tuturuuu account link endpoint',
          env,
          linkPath
        );
      }

      let tuturuuuSide: Record<string, unknown> | null = null;
      if (options.tuturuuuAccessToken) {
        const fetchImpl = options.fetch ?? globalThis.fetch;
        const tRes = await fetchImpl(
          `${client.tuturuuuOrigins.web}${TUTURUUU_UPSKII_LINK_PATH}`,
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${options.tuturuuuAccessToken}`,
            },
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (tRes.ok) {
          const tText = await tRes.text();
          const allSecrets = [
            options.tuturuuuAccessToken,
            ...client.getActiveSecrets(),
          ];
          assertSafeResponseText(tText, allSecrets);
          try {
            tuturuuuSide = JSON.parse(tText) as Record<string, unknown>;
          } catch {
            tuturuuuSide = null;
          }
          if (tuturuuuSide !== null) {
            assertSafeParsedValue(tuturuuuSide, allSecrets);
          }
        }
      }

      const upskiiLinked = Boolean(upskiiRes.data.link);
      const confirmed = upskiiRes.data.confirmed === true;
      const tuturuuuLinked = tuturuuuSide ? Boolean(tuturuuuSide.link) : null;
      const verified =
        upskiiLinked &&
        confirmed &&
        (tuturuuuLinked === null || tuturuuuLinked === true);

      return {
        confirmed,
        enabled: upskiiRes.data.enabled ?? null,
        env,
        link: upskiiRes.data.link ?? null,
        tuturuuuSide,
        upskiiLinked,
        verified,
      };
    };

    const renderHuman = (snap: Awaited<ReturnType<typeof readSnapshot>>) =>
      formatTable(
        [
          {
            Confirmed: snap.confirmed ? 'yes' : 'no',
            Enabled:
              snap.enabled === null ? 'unknown' : snap.enabled ? 'yes' : 'no',
            Env: snap.env,
            LinkId: String(snap.link?.linkId ?? ''),
            TuturuuuUser: String(snap.link?.tuturuuuUserId ?? ''),
            UpskiiLinked: snap.upskiiLinked ? 'yes' : 'no',
            Verified: snap.verified ? 'yes' : 'no',
          },
        ],
        { noColor }
      );

    if (watchSeconds > 0) {
      await runWatchLoop({
        fetch: () => readSnapshot(),
        intervalSeconds: watchSeconds,
        json,
        jsonl: flags.jsonl === true,
        renderHuman,
        title: `Upskii <-> Tuturuuu Link (${env})`,
        write,
      });
      return;
    }

    const snapshot = await readSnapshot();
    write(
      json ? `${JSON.stringify(snapshot, null, 2)}\n` : renderHuman(snapshot)
    );
    if (action === 'verify' && !snapshot.verified) {
      throw new CliError({
        code: 'LINK_NOT_VERIFIED',
        exitCode: CLI_EXIT.conflict,
        hint: 'Complete the Upskii Settings -> Integrations consent flow, then re-run `ttr external upskii link verify`.',
        message:
          'Upskii <-> Tuturuuu account link is not active and confirmed.',
      });
    }
    return;
  }

  if (action === 'unlink') {
    const side = (getFlag(flags, 'side') ?? 'upskii').toLowerCase();
    if (!['upskii', 'tuturuuu', 'both'].includes(side)) {
      throw new CliError({
        code: 'INVALID_SIDE',
        exitCode: CLI_EXIT.usage,
        message: 'Invalid --side. Use upskii, tuturuuu, or both.',
      });
    }
    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii link unlink --env ${env} --side ${side} --yes --confirm UNLINK_UPSKII`,
        changes: [
          { after: 'unlinked', before: 'linked', field: `side:${side}` },
        ],
        confirmToken: 'UNLINK_UPSKII',
        env,
        origin: client.origins.app,
        target: `link:${side}`,
        tier: 2,
        title: 'Disconnect Upskii <-> Tuturuuu account link',
      },
      write,
    });
    if (!gate.applied) return;

    const result: Record<string, unknown> = { env, side };
    if (side === 'upskii' || side === 'both') {
      const res = await client.requestJson<Record<string, unknown>>({
        command: 'external.upskii.link.unlink',
        method: 'DELETE',
        path: `${client.apiBase}/integrations/tuturuuu`,
        reason: gate.reason,
      });
      result.upskii = res.data;
    }
    if (side === 'tuturuuu' || side === 'both') {
      if (!options.tuturuuuAccessToken) {
        throw new CliError({
          code: 'TUTURUUU_AUTH_REQUIRED',
          exitCode: CLI_EXIT.auth,
          hint: 'Run `ttr login` first to unlink on the Tuturuuu side.',
          message: 'Tuturuuu CLI session is required to unlink on Tuturuuu.',
        });
      }
      const fetchImpl = options.fetch ?? globalThis.fetch;
      const tRes = await fetchImpl(
        `${client.tuturuuuOrigins.web}${TUTURUUU_UPSKII_LINK_PATH}`,
        {
          headers: {
            Authorization: `Bearer ${options.tuturuuuAccessToken}`,
          },
          method: 'DELETE',
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!tRes.ok && tRes.status !== 204) {
        throw new CliError({
          code: `TUTURUUU_HTTP_${tRes.status}`,
          exitCode: CLI_EXIT.unavailable,
          message: `Tuturuuu unlink failed (HTTP ${tRes.status}).`,
        });
      }
      result.tuturuuu = { revoked: true };
    }
    write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_LINK_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii link --help`.',
    message: `Unknown link action "${action}".`,
  });
}
