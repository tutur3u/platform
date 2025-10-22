import { TuturuuuClient } from 'tuturuuu';

const tuturuuu = new TuturuuuClient({
  apiKey: process.env.TUTURUUU_API_KEY || '',
  baseUrl: process.env.TUTURUUU_BASE_URL || '',
});

export default async function SDKPage() {
  const files = await tuturuuu.storage.list({
    path: 'documents',
    limit: 50,
  });

  return <div>{JSON.stringify(files, null, 2)}</div>;
}
