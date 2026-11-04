import { expect, it, vi } from 'vitest';
import {
  getWorkspaceExternalProjectPageVersion,
  listWorkspaceExternalProjectPageVersions,
  publishWorkspaceExternalProjectPageVersion,
  saveWorkspaceExternalProjectPageVersion,
} from './external-project-page-versions';

it('uses the scoped edit/preview/publish API paths and draft payload contract', async () => {
  const send = vi.fn(async () => Response.json({ id: 'version' }));
  const options = { baseUrl: 'https://api.example.test', fetch: send };
  await listWorkspaceExternalProjectPageVersions('workspace', 'entry', options);
  await getWorkspaceExternalProjectPageVersion(
    'workspace',
    'entry',
    'version',
    options
  );
  await saveWorkspaceExternalProjectPageVersion(
    'workspace',
    'entry',
    { schemaVersion: 1, data: { content: [] } },
    options
  );
  await publishWorkspaceExternalProjectPageVersion(
    'workspace',
    'entry',
    'version',
    options
  );
  const base =
    'https://api.example.test/api/v1/workspaces/workspace/external-projects/entries/entry/page-versions';
  expect(send).toHaveBeenNthCalledWith(
    1,
    base,
    expect.objectContaining({ cache: 'no-store' })
  );
  expect(send).toHaveBeenNthCalledWith(
    2,
    `${base}/version`,
    expect.objectContaining({ cache: 'no-store' })
  );
  expect(send).toHaveBeenNthCalledWith(
    3,
    base,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ schemaVersion: 1, data: { content: [] } }),
    })
  );
  expect(send).toHaveBeenNthCalledWith(
    4,
    `${base}/version/publish`,
    expect.objectContaining({ method: 'POST' })
  );
});
