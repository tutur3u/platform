import { type FlagValue, getFlag } from './args';
import { parseDevboxExecutionMode } from './devbox-host-protection';
import {
  checkCredentialIsolation,
  collectDevboxIsolation,
  type DevboxIsolationFinding,
  evaluateDevboxIsolation,
} from './devbox-isolation';
import { getDefaultRunnerTokenFile } from './devbox-setup-service';

// `ttr box doctor --isolation`: read-only evidence that a runner identity is
// isolated. Run it as the runner's service user; add --other-user <judge> to
// prove that user cannot read this runner's credential, home or checkout.
// Exits 1 unless every check the execution mode requires is proven and no
// non-advisory check fails; undetermined checks are reported as unknown.
export async function runDevboxIsolationDoctor({
  flags,
  json,
  env = process.env,
  stdout = (value: string) => process.stdout.write(value),
}: {
  flags: Record<string, FlagValue>;
  json: boolean;
  env?: NodeJS.ProcessEnv;
  stdout?: (value: string) => void;
}) {
  const mode = parseDevboxExecutionMode(
    getFlag(flags, 'execution-mode') ?? env.TUTURUUU_DEVBOX_EXECUTION_MODE
  );
  const tokenFile =
    getFlag(flags, 'token-file') ??
    env.TUTURUUU_DEVBOX_TOKEN_FILE ??
    getDefaultRunnerTokenFile(undefined, getFlag(flags, 'service-name'));
  const { summary, findings } = await collectDevboxIsolation({
    tokenFile,
    serviceUser: getFlag(flags, 'service-user'),
    probes: { env },
  });
  const otherUser = getFlag(flags, 'other-user');
  const credential: DevboxIsolationFinding[] = otherUser
    ? await checkCredentialIsolation({
        tokenFile,
        otherUser,
        home: env.HOME,
        checkoutDir: getFlag(flags, 'checkout-dir') ?? process.cwd(),
      })
    : [];
  const all = [...findings, ...credential];
  const { ok, required, missing } = evaluateDevboxIsolation(
    all,
    mode,
    credential.map((finding) => finding.check)
  );
  if (json)
    stdout(
      `${JSON.stringify({ ok, mode, tokenFile, required, missing, summary, findings: all }, null, 2)}\n`
    );
  else
    stdout(
      `${all
        .map(
          (finding) =>
            `${finding.status === 'pass' ? 'pass' : finding.status === 'fail' ? 'FAIL' : 'unknown'} ${finding.check}${finding.advisory ? ' (advisory)' : required.includes(finding.check) ? ' (required)' : ''}: ${finding.detail}`
        )
        .join('\n')}\n${
        ok
          ? `Isolation checks passed for ${mode} mode.`
          : `Isolation checks failed for ${mode} mode${missing.length ? `; not proven: ${missing.join(', ')}` : ''}.`
      }\n`
    );
  if (!ok) process.exitCode = 1;
  return { ok, findings: all, missing };
}
