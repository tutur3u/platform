import { CLI_EXIT, CliError, type MutationPreview } from './cli-contracts';
import { rejectSecretFlags } from './credential-store';
import { formatMutationPreview } from './ui/diff';

type PreviewFormatter = (preview: MutationPreview, noColor: boolean) => string;

function formatPreview(preview: MutationPreview, noColor: boolean) {
  return formatMutationPreview(preview, { noColor }).trimEnd();
}

export async function requireMutationGate(options: {
  explicitEnvFlag?: boolean;
  preview: MutationPreview;
  flags: Record<string, unknown>;
  json?: boolean;
  noColor?: boolean;
  promptInput?: (question: string) => Promise<string>;
  isInteractive?: boolean;
  qaVerified?: boolean;
  write?: (chunk: string) => void;
  formatPreview?: PreviewFormatter;
}): Promise<{ applied: boolean; reason?: string }> {
  const { preview, flags } = options;
  rejectSecretFlags(flags);
  const dryRun = flags['dry-run'];
  if (
    dryRun !== undefined &&
    dryRun !== false &&
    dryRun !== true &&
    dryRun !== 'true'
  ) {
    throw new CliError({
      code: 'INVALID_DRY_RUN',
      exitCode: CLI_EXIT.usage,
      message: 'Pass --dry-run without a value.',
    });
  }
  if (flags.yes !== true || dryRun === true || dryRun === 'true') {
    const write =
      options.write ?? ((chunk: string) => process.stdout.write(chunk));
    const output = options.json
      ? JSON.stringify({ applied: false, preview })
      : (options.formatPreview ?? formatPreview)(
          preview,
          options.noColor ?? false
        );
    write(`${output}\n`);
    return { applied: false };
  }

  if (preview.env === 'prod' && options.explicitEnvFlag !== true) {
    throw new CliError({
      code: 'PROD_ENV_EXPLICIT_REQUIRED',
      exitCode: CLI_EXIT.policy,
      hint: 'Pass --env prod explicitly to apply a production mutation.',
      message:
        'Refusing production mutation because --env prod was not passed explicitly.',
    });
  }

  const reason = typeof flags.reason === 'string' ? flags.reason.trim() : '';
  if (preview.env === 'prod' && options.qaVerified !== true && !reason) {
    throw new CliError({
      code: 'REASON_REQUIRED',
      exitCode: CLI_EXIT.policy,
      message: 'Production writes require a reason.',
      hint: 'Pass --reason "<reason>".',
    });
  }

  if (preview.tier === 2) {
    const token = preview.confirmToken;
    let confirmation = flags.confirm;
    if (
      token &&
      confirmation === undefined &&
      options.isInteractive &&
      options.promptInput
    ) {
      confirmation = await options.promptInput(`Type "${token}" to confirm: `);
    }
    if (!token || confirmation !== token) {
      throw new CliError({
        code: 'CONFIRMATION_REQUIRED',
        exitCode: CLI_EXIT.policy,
        message: 'Exact confirmation is required.',
        hint: token
          ? `Pass --confirm ${JSON.stringify(token)}.`
          : preview.applyHint,
      });
    }
  }
  return reason ? { applied: true, reason } : { applied: true };
}

export function requireReadOnly(operation: string): never {
  throw new CliError({
    code: 'WRITE_PROHIBITED',
    exitCode: CLI_EXIT.policy,
    message: `${operation} is unavailable in read-only mode.`,
  });
}
