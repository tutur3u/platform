import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { runExternalCommand } from './external-admin';

const configuration = {
  id: 'rennu',
  displayName: 'Ren',
  enabled: true,
  origins: ['https://rennu.ttr.gg'],
  allowedScopes: ['external-projects:read'],
  allowedWorkspaceIds: ['2e627dd0-3b4b-472e-b6de-3fb4b767a775'],
};
function fixture() {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json({ apps: [configuration] }));
  const client = new TuturuuuUserClient({
    accessToken: 'test-only-token',
    baseUrl: 'https://tuturuuu.com',
    fetch,
  });
  const output = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const run = (
    positionals: string[],
    flags: Record<string, string | boolean> = {}
  ) =>
    runExternalCommand({
      client,
      positionals,
      flags,
      json: true,
      workspaceId: 'personal',
    });
  return { client, fetch, output, run };
}
afterEach(() => vi.restoreAllMocks());
describe('external app CLI', () => {
  it('uses authenticated SDK requests for safe registration reads', async () => {
    const { run, fetch, output } = fixture();
    await run(['apps', 'get', 'rennu']);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://tuturuuu.com/api/v1/admin/external-apps'
    );
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')
    ).toBe('Bearer test-only-token');
    expect(output).toHaveBeenCalledWith(expect.stringContaining('rennu'));
  });
  it('validates configuration before dry-run and requires confirmation before saving', async () => {
    const { run, client, output } = fixture();
    const save = vi
      .spyOn(client.external.admin, 'saveApp')
      .mockResolvedValue({ app: configuration });
    const file = join(
      await mkdtemp(join(tmpdir(), 'ttr-app-test-')),
      'app.json'
    );
    await writeFile(file, JSON.stringify(configuration));
    await run(['apps', 'save'], { file, 'dry-run': true });
    expect(save).not.toHaveBeenCalled();
    await expect(run(['apps', 'save'], { file })).rejects.toThrow(
      'CONFIGURE_EXTERNAL_APP'
    );
    await run(['apps', 'save'], { file, confirm: 'CONFIGURE_EXTERNAL_APP' });
    expect(save).toHaveBeenCalledWith(configuration);
    await writeFile(
      file,
      JSON.stringify({ ...configuration, secret: 'do-not-print-this' })
    );
    await expect(
      run(['apps', 'save'], { file, 'dry-run': true })
    ).rejects.toThrow('Invalid app JSON');
    expect(JSON.stringify(output.mock.calls)).not.toContain(
      'do-not-print-this'
    );
  });
  it('previews, replaces, and explicitly revokes scopes without copying audit fields', async () => {
    const { run, client } = fixture();
    const save = vi
      .spyOn(client.external.admin, 'saveApp')
      .mockResolvedValue({ app: configuration });
    await run(['apps', 'scopes', 'rennu'], {
      scopes: 'external-projects:read,external-projects:manage',
      'dry-run': true,
    });
    expect(save).not.toHaveBeenCalled();
    await expect(
      run(['apps', 'scopes', 'rennu'], { 'clear-scopes': true })
    ).rejects.toThrow('APPROVE_EXTERNAL_APP_SCOPES');
    await run(['apps', 'scopes', 'rennu'], {
      'clear-scopes': true,
      confirm: 'APPROVE_EXTERNAL_APP_SCOPES',
    });
    expect(save).toHaveBeenCalledWith({ ...configuration, allowedScopes: [] });
  });
  it('requires an explicit workspace and confirmation for bindings', async () => {
    const { run, client } = fixture();
    const bind = vi.spyOn(client.external.admin, 'bind').mockResolvedValue({});
    await expect(
      run(['binding', 'set'], { template: 'rennu' })
    ).rejects.toThrow('workspace');
    await expect(
      run(['binding', 'set'], {
        workspace: configuration.allowedWorkspaceIds[0]!,
        template: 'rennu',
      })
    ).rejects.toThrow('LINK_SITE_TEMPLATE');
    expect(bind).not.toHaveBeenCalled();
    await run(['binding', 'set'], {
      workspace: configuration.allowedWorkspaceIds[0]!,
      template: 'rennu',
      confirm: 'LINK_SITE_TEMPLATE',
    });
    expect(bind).toHaveBeenCalledWith(
      configuration.allowedWorkspaceIds[0],
      'rennu'
    );
  });
  it('writes a rotated secret privately and refuses to overwrite before rotation', async () => {
    const { run, client, output } = fixture();
    const rotate = vi
      .spyOn(client.external.admin, 'rotateSecret')
      .mockResolvedValue({
        app: configuration,
        secret: 'test-only-rotated-secret',
      });
    const path = join(
      await mkdtemp(join(tmpdir(), 'ttr-secret-test-')),
      'app-secret'
    );
    const flags = { 'secret-out': path, confirm: 'ROTATE_EXTERNAL_APP_SECRET' };
    await run(['apps', 'rotate-secret', 'rennu'], flags);
    expect(await readFile(path, 'utf8')).toBe('test-only-rotated-secret\n');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(output.mock.calls)).not.toContain(
      'test-only-rotated-secret'
    );
    await expect(
      run(['apps', 'rotate-secret', 'rennu'], flags)
    ).rejects.toThrow();
    expect(rotate).toHaveBeenCalledTimes(1);
  });
});
