import { describe, expect, it, vi } from 'vitest';
import { CLI_EXIT, type MutationPreview } from './cli-contracts';
import { requireMutationGate, requireReadOnly } from './safety-gate';

const preview: MutationPreview = {
  tier: 1,
  env: 'prod',
  title: 'Modify record',
  target: 'record:42',
  origin: 'https://example.test',
  applyHint: 'Use --yes to apply.',
  changes: [{ field: 'enabled', before: false, after: true }],
};
const staging = { ...preview, env: 'staging' } as const;
const tierTwo = { ...staging, tier: 2, confirmToken: 'DELETE 42' } as const;

describe('mutation gate', () => {
  it('displays a production diff and hint unless explicitly applying', async () => {
    const write = vi.fn();
    expect(await requireMutationGate({ preview, flags: {}, write })).toEqual({
      applied: false,
    });
    const output = write.mock.calls[0]?.[0];
    for (const value of [
      '[ENV: PROD]',
      'enabled',
      'false',
      'true',
      preview.applyHint,
    ])
      expect(output).toContain(value);
  });

  it('emits structured JSON for dry runs even when --yes is set', async () => {
    const write = vi.fn();
    expect(
      await requireMutationGate({
        preview,
        flags: { yes: true, 'dry-run': true },
        json: true,
        write,
      })
    ).toEqual({ applied: false });
    expect(JSON.parse(write.mock.calls[0]?.[0])).toEqual({
      applied: false,
      preview,
    });
  });

  it('requires explicit --env prod and reason unless qaVerified is explicitly true', async () => {
    await expect(
      requireMutationGate({
        preview,
        flags: { yes: true, reason: 'reviewed' },
      })
    ).rejects.toMatchObject({
      code: 'PROD_ENV_EXPLICIT_REQUIRED',
      exitCode: CLI_EXIT.policy,
    });
    await expect(
      requireMutationGate({
        explicitEnvFlag: true,
        preview,
        flags: { yes: true, reason: ' ' },
      })
    ).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
      exitCode: CLI_EXIT.policy,
    });
    // Target prefix alone ("qa:...") must NOT bypass prod reason check (M3)
    await expect(
      requireMutationGate({
        explicitEnvFlag: true,
        preview: { ...preview, target: 'qa:spoofed' },
        flags: { yes: true },
      })
    ).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
      exitCode: CLI_EXIT.policy,
    });
    expect(
      await requireMutationGate({
        explicitEnvFlag: true,
        preview,
        flags: { yes: true, reason: ' reviewed ' },
      })
    ).toEqual({ applied: true, reason: 'reviewed' });
    expect(
      await requireMutationGate({
        explicitEnvFlag: true,
        preview,
        qaVerified: true,
        flags: { yes: true },
      })
    ).toEqual({ applied: true });
    expect(
      await requireMutationGate({ preview: staging, flags: { yes: true } })
    ).toEqual({ applied: true });
  });

  it('requires --yes for Tier 2 even with exact confirmation', async () => {
    const promptInput = vi.fn();
    const write = vi.fn();
    expect(
      await requireMutationGate({
        preview: tierTwo,
        flags: { confirm: 'DELETE 42' },
        isInteractive: true,
        promptInput,
        write,
      })
    ).toEqual({ applied: false });
    expect(promptInput).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
  });

  it.each([undefined, 'delete 42', 'DELETE 42 '])(
    'requires exact non-interactive confirmation for %s',
    async (confirm) => {
      const promptInput = vi.fn();
      await expect(
        requireMutationGate({
          preview: tierTwo,
          flags: { yes: true, confirm },
          isInteractive: false,
          promptInput,
        })
      ).rejects.toMatchObject({
        code: 'CONFIRMATION_REQUIRED',
        exitCode: CLI_EXIT.policy,
        hint: 'Pass --confirm "DELETE 42".',
      });
      expect(promptInput).not.toHaveBeenCalled();
    }
  );

  it('accepts exact flag or interactive input and rejects incorrect interactive input', async () => {
    expect(
      await requireMutationGate({
        preview: tierTwo,
        flags: { yes: true, confirm: 'DELETE 42' },
      })
    ).toEqual({ applied: true });
    const promptInput = vi
      .fn()
      .mockResolvedValueOnce('DELETE 42')
      .mockResolvedValueOnce('DELETE 42 ');
    const options = {
      preview: tierTwo,
      flags: { yes: true },
      isInteractive: true,
      promptInput,
    };
    expect(await requireMutationGate(options)).toEqual({ applied: true });
    expect(promptInput).toHaveBeenCalledWith(
      expect.stringContaining('DELETE 42')
    );
    await expect(requireMutationGate(options)).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });
  });

  it('refuses secrets and unsafe dry-run values', async () => {
    await expect(
      requireMutationGate({
        preview: staging,
        flags: { yes: true, token: 'fixture' },
      })
    ).rejects.toMatchObject({ code: 'SECRET_IN_CLI_FLAG' });
    await expect(
      requireMutationGate({
        preview: staging,
        flags: { yes: true, 'dry-run': 'false' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_DRY_RUN' });
    expect(() => requireReadOnly('Update record')).toThrow(
      expect.objectContaining({
        code: 'WRITE_PROHIBITED',
        exitCode: CLI_EXIT.policy,
      })
    );
  });
});
