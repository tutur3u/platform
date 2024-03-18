import { getSecrets } from '@/lib/workspace-helper';

export async function getReports(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  try {
    const secrets = await getSecrets({ wsId, forceAdmin: true });

    const fetchApi = secrets.find(
      (secret) => secret.name === 'EXTERNAL_USER_REPORTS_FETCH_API'
    )?.value;

    const apiKey = secrets.find(
      (secret) => secret.name === 'EXTERNAL_USER_REPORTS_API_KEY'
    )?.value;

    if (!fetchApi || !apiKey) return { data: [], count: 0 };

    const from = (parseInt(page) - 1) * parseInt(pageSize);
    const fetchUrl = `${fetchApi}?${
      q ? `search=${q}&` : ''
    }from=${from}&limit=${pageSize}`;

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ttr-api-key': apiKey,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch reports', response);
      return { data: [], count: 0 };
    }

    const { reports: data, count } = await response.json();

    return { data, count } as { data: any[]; count: number };
  } catch (error) {
    console.error(error);
    return { data: [], count: 0 };
  }
}

export async function getReportsCount(wsId: string) {
  const { count } = await getReports(wsId, {
    page: '1',
    pageSize: '1',
  });

  return count;
}
