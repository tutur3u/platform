import { expect, it, vi } from 'vitest';
import { uploadLettinNotebookDriveCopy } from './lettin-drive-copy';

const actor = '11111111-1111-4111-8111-111111111111';
const file = new File(
  ['{}'],
  'lettin-notebook-33333333-3333-4333-8333-333333333333.json',
  { type: 'application/json' }
);
it.each(['r2', 'supabase'] as const)(
  'retains %s signed provider and actor binding across copy stages',
  async (provider) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, _init) => {
      if (String(input).endsWith('/upload-url'))
        return Response.json({
          signedUrl: 'https://fixture.example/upload',
          path: `Lettin/${file.name}`,
          provider,
        });
      return new Response('{}', { status: 200 });
    });
    const result = await uploadLettinNotebookDriveCopy(
      'workspace',
      actor,
      file,
      { fetch }
    );
    expect(result.finalize?.success).toBe(true);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      expectedActor: actor,
      filename: file.name,
      path: 'Lettin',
      upsert: false,
      contentType: 'application/json',
      size: 2,
    });
    expect(fetch.mock.calls[1]![1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetch.mock.calls[2]![1]?.body))).toEqual({
      expectedActor: actor,
      path: `Lettin/${file.name}`,
      originalFilename: file.name,
      contentType: 'application/json',
      provider,
    });
  }
);
it.each([
  { provider: undefined },
  { provider: 'r2', path: 'foreign/object.json' },
])('stops before PUT on invalid authorization %j', async (delta) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      signedUrl: 'https://fixture.example/upload',
      path: `Lettin/${file.name}`,
      provider: 'r2',
      ...delta,
    })
  );
  await expect(
    uploadLettinNotebookDriveCopy('workspace', actor, file, { fetch })
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('reports partial finalization rather than repeating or deleting an accepted PUT', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if (String(input).endsWith('/upload-url'))
      return Response.json({
        signedUrl: 'https://fixture.example/upload',
        path: `Lettin/${file.name}`,
        provider: 'r2',
      });
    if (String(input).endsWith('/finalize-upload'))
      return Response.json({}, { status: 409 });
    return new Response(null, { status: 200 });
  });
  expect(
    (await uploadLettinNotebookDriveCopy('workspace', actor, file, { fetch }))
      .finalize?.success
  ).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
});
