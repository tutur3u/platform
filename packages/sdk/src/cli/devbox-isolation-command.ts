import { type FlagValue, getFlag } from './args';
import {
  checkCredentialIsolation,
  collectDevboxIsolation,
  type DevboxIsolationFinding,
} from './devbox-isolation';
import { getDefaultRunnerTokenFile } from './devbox-setup-service';

// `ttr box doctor --isolation`: read-only evidence that a runner identity is
// isolated. Run it as the runner's service user; add --other-user <judge> to
// prove that user cannot read this runner's credential. Exits 1 on any fail.
export async function runDevboxIsolationDoctor({
  flags,
  json,
  stdout = (value: string) => process.stdout.write(value),
}: {
  flags: Record<string, FlagValue>;
  json: boolean;
  stdout?: (value: string) => void;
}) {
  const tokenFile =
    getFlag(flags, 'token-file') ??
    process.env.TUTURUUU_DEVBOX_TOKEN_FILE ??
    getDefaultRunnerTokenFile(undefined, getFlag(flags, 'service-name'));
  const { summary, findings } = await collectDevboxIsolation({
    tokenFile,
    serviceUser: getFlag(flags, 'service-user'),
  });
  const otherUser = getFlag(flags, 'other-user');
  const credential: DevboxIsolationFinding[] = otherUser
    ? await checkCredentialIsolation({ tokenFile, otherUser })
    : [];
  const all = [...findings, ...credential];
  const ok = all.every((finding) => finding.ok);
  if (json)
    stdout(
      `${JSON.stringify({ ok, tokenFile, summary, findings: all }, null, 2)}\n`
    );
  else
    stdout(
      `${all
        .map(
          (finding) =>
            `${finding.ok ? 'pass' : 'FAIL'} ${finding.check}: ${finding.detail}`
        )
        .join(
          '\n'
        )}\n${ok ? 'Isolation checks passed.' : 'Isolation checks failed.'}\n`
    );
  if (!ok) process.exitCode = 1;
  return { ok, findings: all };
}
