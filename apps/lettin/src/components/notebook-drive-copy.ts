import { uploadWorkspaceStorageFile } from '@tuturuuu/internal-api/storage';
export const notebookCopyLimit = 10 * 1024 * 1024;
export function notebookExportBlob(value: unknown) {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
  if (blob.size > notebookCopyLimit) throw new Error('Export too large');
  return blob;
}
/** Guard every canonical client transport stage, including the signed PUT. */
export async function copyNotebookToDrive(
  wsId: string,
  blob: Blob,
  assertActive: () => void
) {
  assertActive();
  if (blob.size > notebookCopyLimit || blob.type !== 'application/json')
    throw new Error('Invalid notebook copy');
  const file = new File([blob], `lettin-notebook-${crypto.randomUUID()}.json`, {
    type: 'application/json',
  });
  const transport = globalThis.fetch.bind(globalThis);
  let putStarted = false;
  const result = await uploadWorkspaceStorageFile(
    wsId,
    file,
    { path: 'Lettin', upsert: false },
    {
      fetch: async (input, init) => {
        assertActive();
        if (init?.method === 'PUT') {
          if (putStarted) throw new Error('Notebook upload already attempted');
          putStarted = true;
        }
        const response = await transport(input, init);
        assertActive();
        return response;
      },
    }
  );
  assertActive();
  return result;
}
